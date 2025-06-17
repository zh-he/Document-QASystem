# RAG_QA.py
import logging
from vector_manager import VectorStoreManager

logger = logging.getLogger(__name__)


def rag_qa(query: str) -> str:
    """
    对外暴露的 RAG 问答接口，直接使用 VectorStoreManager 中的 QA 链回答问题。
    """
    try:
        qa_chain = VectorStoreManager.get_qa_chain()
        response = qa_chain.invoke(query)
        print(response)
        return response.get('result')
    except Exception as e:
        logger.error(f"RAG QA 执行错误: {e}")
        return f"很抱歉，执行回答时出错: {e}"
