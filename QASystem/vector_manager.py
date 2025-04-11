import logging
import os
from pathlib import Path
from typing import List

from langchain.chains import RetrievalQA
from langchain.docstore.document import Document
from langchain.embeddings import HuggingFaceEmbeddings
from langchain.vectorstores import FAISS

from config import Config
from text_process import DocumentSplitter, TextProcessor

logger = logging.getLogger(__name__)


class VectorStoreManager:
    # 全局共享对象
    vector_store = None
    qa_chain = None
    embeddings = None
    index_path = None  # 向量库保存路径

    @classmethod
    def initialize(cls, index_path: str = None, document_folder: str = None):
        """
        初始化向量库及 QA 链。
        - 如果 index_path 存在，尝试加载已经保存的向量库；
        - 否则如果指定了 document_folder，则从该目录中的 PDF 文档构建向量库；
        - 然后构建基于向量库的 RetrievalQA 链。
        """
        if cls.vector_store is not None:
            return  # 已经初始化过

        if not cls.embeddings:
            cls.embeddings = HuggingFaceEmbeddings(
                model_name=Config.EMBEDDING_MODEL_PATH,
                model_kwargs={"device": "cuda"}  # 根据实际环境选择设备
            )
        if index_path:
            cls.index_path = index_path

        # 尝试加载持久化的向量库
        if index_path and os.path.exists(index_path):
            try:
                cls.vector_store = FAISS.load_local(index_path, cls.embeddings, allow_dangerous_deserialization=True)
                logger.info("已从持久化索引加载向量库。")
            except Exception as e:
                logger.error(f"从 {index_path} 加载向量库失败：{e}")
                cls.vector_store = None

        # 如果加载失败且指定了文档目录，则从文档构建向量库
        if cls.vector_store is None and document_folder:
            documents = []
            folder_path = Path(document_folder)
            files = list(folder_path.glob("*.pdf"))
            for path in files:
                text = TextProcessor.extract_and_process_text(path)
                if text:
                    documents.append(Document(page_content=text))
            if not documents:
                logger.warning("在指定的文档目录中未找到有效文档！")
            else:
                splitter = DocumentSplitter()  # 默认配置：chunk_size=1000, chunk_overlap=100
                splitted_docs = splitter.split_documents(documents)
                logger.info(f"处理 {len(documents)} 个文档，分割得到 {len(splitted_docs)} 个文本块。")
                cls.vector_store = FAISS.from_documents(splitted_docs, cls.embeddings, normalize_L2=True)
                if index_path:
                    cls.vector_store.save_local(index_path)
                logger.info("从文档构建并保存新的向量库。")

        # 根据向量库构建 QA 链
        if cls.vector_store:
            retriever = cls.vector_store.as_retriever(search_type="similarity", search_kwargs={"k": 3})
            llm = Config.LLM_MODEL
            cls.qa_chain = RetrievalQA.from_chain_type(llm=llm, chain_type="stuff", retriever=retriever)
            logger.info("基于当前向量库构建 QA 链。")

    @classmethod
    def update_with_documents(cls, new_documents: List[Document]):
        """
        使用新的文档（或文档分块）更新向量库，并刷新 QA 链。
        """
        if not cls.embeddings:
            cls.embeddings = HuggingFaceEmbeddings(
                model_name=Config.EMBEDDING_MODEL_PATH,
                model_kwargs={"device": "cuda"}
            )
        if cls.vector_store is None:
            # 没有现有向量库，则直接创建
            cls.vector_store = FAISS.from_documents(new_documents, cls.embeddings, normalize_L2=True)
            logger.info("使用上传的文档创建新的向量库。")
        else:
            # 已存在，直接添加新文档
            cls.vector_store.add_documents(new_documents)
            logger.info("将新文档添加到现有向量库中。")

        # 保存更新后的向量库（如果配置了保存路径）
        if cls.index_path:
            cls.vector_store.save_local(cls.index_path)
            logger.info(f"已保存更新后的向量库至 {cls.index_path}。")

        # 重新构建 QA 链以使用最新的向量库
        retriever = cls.vector_store.as_retriever(search_type="similarity", search_kwargs={"k": 3})
        llm = Config.LLM_MODEL
        cls.qa_chain = RetrievalQA.from_chain_type(llm=llm, chain_type="stuff", retriever=retriever)
        logger.info("QA 链已更新以反映最新的向量库状态。")

    @classmethod
    def get_qa_chain(cls):
        if cls.qa_chain is None:
            raise ValueError("QA 链尚未初始化，请先调用 initialize()。")
        return cls.qa_chain

    @classmethod
    def get_vector_store(cls):
        if cls.vector_store is None:
            raise ValueError("向量库尚未初始化，请先调用 initialize()。")
        return cls.vector_store
