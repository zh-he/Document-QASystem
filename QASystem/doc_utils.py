import os
from pdfminer.high_level import extract_text as pdf_extract_text
from docx import Document as DocxDocument


def load_text_file(file_path):
    """
    从纯文本文件中加载全文内容。
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            text = f.read()
        return text
    except Exception as e:
        raise RuntimeError(f"读取文本文件时出错: {e}")


def load_pdf(file_path):
    """
    从 PDF 文件中提取文本。
    """
    try:
        text = pdf_extract_text(file_path)
        return text
    except Exception as e:
        raise RuntimeError(f"从 PDF 提取文本时出错: {e}")


def load_md(file_path):
    """
    从 Markdown 文件中读取文本。
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            md_content = f.read()
        return md_content
    except Exception as e:
        raise RuntimeError(f"读取 Markdown 文件时出错: {e}")


def load_docx(file_path):
    """
    从 Word (docx) 文档中加载文本.
    如果要兼容 .doc (老格式), 需要先转换为 docx 或使用其他库。
    """
    try:
        doc = DocxDocument(file_path)
        paragraphs = [p.text for p in doc.paragraphs]
        full_text = "\n".join(paragraphs)
        return full_text
    except Exception as e:
        raise RuntimeError(f"加载 Word 文件时出错: {e}")


def load_document(file_path):
    """
    统一入口，根据文件扩展名加载不同类型的文档.
    支持: .pdf, .txt, .md, .docx
    """
    _, ext = os.path.splitext(file_path)
    ext = ext.lower()

    if ext == '.pdf':
        return load_pdf(file_path)
    elif ext == '.txt':
        return load_text_file(file_path)
    elif ext == '.md':
        return load_md(file_path)
    elif ext == '.docx':
        return load_docx(file_path)
    else:
        # 对于不支持的文件类型，直接抛出异常，或返回空字符串
        raise ValueError(f"不支持的文件类型: {ext}")
