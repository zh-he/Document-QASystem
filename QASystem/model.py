from datetime import datetime
from flask_login import UserMixin
from flask_sqlalchemy import SQLAlchemy
from passlib.hash import pbkdf2_sha256
from sqlalchemy import text
from sqlalchemy.orm import validates

db = SQLAlchemy()


class UserRole(db.Model):
    """用户角色表"""
    __tablename__ = 'user_roles'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), unique=True, nullable=False)  # 角色名称（如 super_admin, admin, mini_user）
    description = db.Column(db.String(255), nullable=True)  # 角色描述

    def __repr__(self):
        return f"<UserRole {self.name}>"


class User(db.Model, UserMixin):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    role_id = db.Column(db.Integer, db.ForeignKey('user_roles.id'), nullable=True)
    role = db.relationship('UserRole', backref='users', lazy='joined')
    approved = db.Column(db.Boolean, default=False)

    # 添加与Session的关系
    sessions = db.relationship('Session', backref='user', lazy='dynamic',
                               cascade='all, delete-orphan')

    @validates('username')
    def validate_username(self, key, username):
        if len(username) < 4:
            raise ValueError("用户名至少需要4个字符")
        return username

    def set_password(self, password):
        if len(password) < 8:
            raise ValueError("密码至少需要8个字符")
        self.password_hash = pbkdf2_sha256.hash(password)

    def check_password(self, password):
        return pbkdf2_sha256.verify(password, self.password_hash)


class Document(db.Model):
    __tablename__ = 'documents'

    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'))

    def __repr__(self):
        return f"<Document {self.filename}>"


class Session(db.Model):
    """对话会话表"""
    __tablename__ = 'sessions'

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(128), default="新对话")
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 添加与Message的关系
    messages = db.relationship('Message', backref='session', lazy='dynamic',
                               cascade='all, delete-orphan')

    @validates('title')
    def validate_title(self, key, title):
        if not title or len(title.strip()) == 0:
            return "新对话"
        return title[:128]  # 限制标题长度

    def __repr__(self):
        return f"<Session {self.id}: {self.title}>"

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'message_count': self.messages.count()
        }


class Message(db.Model):
    """对话消息表"""
    __tablename__ = 'messages'

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('sessions.id'), nullable=False)
    role = db.Column(db.String(16), nullable=False)  # 'user' 或 'assistant'
    content = db.Column(db.Text, nullable=False)
    # 同时设置 Python 端默认值和数据库端默认值：
    created_at = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        server_default=text("CURRENT_TIMESTAMP")
    )

    context = db.Column(db.JSON, nullable=True)  # 存储相关文档片段等上下文信息
    message_metadata = db.Column(db.JSON, nullable=True)  # 存储模型响应的元数据

    @validates('role')
    def validate_role(self, key, role):
        if role not in ['user', 'assistant']:
            raise ValueError("role must be either 'user' or 'assistant'")
        return role

    @validates('content')
    def validate_content(self, key, content):
        if not content or len(content.strip()) == 0:
            raise ValueError("message content cannot be empty")
        return content.strip()

    def __repr__(self):
        return f"<Message {self.id}: {self.role}>"

    def to_dict(self):
        return {
            'id': self.id,
            'role': self.role,
            'content': self.content,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'context': self.context,
            'metadata': self.message_metadata
        }