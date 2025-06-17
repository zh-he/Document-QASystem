import os
from datetime import timedelta

from dotenv import load_dotenv

from langchain_openai import ChatOpenAI

load_dotenv()  # 加载 .env 文件中的环境变量

basedir = os.path.abspath(os.path.dirname(__file__))


class Config:
    # Flask 通用配置
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'your-secret-key'  # 添加 Flask 密钥，用于 CSRF 保护等
    DEBUG = os.environ.get('DEBUG') or True  # 配置 Debug 模式，默认为 True

    # SQLAlchemy 数据库配置
    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URI") or "sqlite:///" + os.path.join(basedir, "database.db")
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # JWT 配置
    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY") or "替换secret key"  # 从环境变量读取 JWT 密钥，或设置默认值
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(days=1)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=30)

    # 向量库配置
    VECTORSTORE_DIR = os.environ.get("VECTORSTORE_DIR") or os.path.join(basedir, "vectorstore")  # 从环境变量读取或设置默认值
    EMBEDDING_MODEL_PATH = os.environ.get("EMBEDDING_MODEL_PATH",
                                          "Your Embedding Path")  # 从环境变量读取或设置默认值

    # 文档上传配置
    UPLOAD_FOLDER = os.environ.get("UPLOAD_FOLDER") or os.path.join(basedir, "documents")  # 从环境变量读取或设置默认值
    ALLOWED_EXTENSIONS = {'pdf', 'txt', 'doc', 'docx'}

    # API Keys (如果需要，可以添加到这里，示例)
    DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY")

    LLM_MODEL = ChatOpenAI(model='deepseek-chat',temperature=0.1, api_key=DEEPSEEK_API_KEY, base_url="https://api.deepseek.com")
