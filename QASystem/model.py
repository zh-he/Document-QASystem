from datetime import datetime
from flask_login import UserMixin
from flask_sqlalchemy import SQLAlchemy
from passlib.hash import pbkdf2_sha256
from sqlalchemy import text
from sqlalchemy.orm import validates

db = SQLAlchemy()


# ────────────────────────────────
# 通用 Mixin
# ────────────────────────────────
class TimestampMixin:
    """统一的时间戳字段"""
    created_at = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        server_default=text("CURRENT_TIMESTAMP"),
        nullable=False,
        index=True,
    )
    updated_at = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        server_default=text("CURRENT_TIMESTAMP"),
        nullable=False,
    )


class PKMixin:
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)


# ────────────────────────────────
# 用户 & 角色
# ────────────────────────────────
class UserRole(db.Model, PKMixin, TimestampMixin):
    __tablename__ = 'user_roles'

    name = db.Column(db.String(50), unique=True, nullable=False)
    description = db.Column(db.String(255), nullable=True)

    users = db.relationship(
        'User', back_populates='role', lazy='dynamic', cascade='all, delete-orphan'
    )

    def __repr__(self):
        return f"<UserRole {self.name}>"


class User(db.Model, UserMixin, PKMixin, TimestampMixin):
    __tablename__ = 'users'

    username = db.Column(db.String(64), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(128), nullable=False)
    approved = db.Column(db.Boolean, default=False, server_default=text('0'))

    # 角色关联
    role_id = db.Column(db.Integer, db.ForeignKey('user_roles.id'), nullable=True)
    role = db.relationship('UserRole', back_populates='users', lazy='joined')

    # 会话关联
    sessions = db.relationship(
        'Session', back_populates='user', lazy='dynamic', cascade='all, delete-orphan'
    )

    # 文档关联（上传者）
    documents = db.relationship(
        'Document', back_populates='uploader', lazy='dynamic', cascade='all, delete-orphan'
    )

    @validates('username')
    def _validate_username(self, key, username):
        username = username.strip()
        if len(username) < 4:
            raise ValueError('用户名至少需要 4 个字符')
        return username

    def set_password(self, password: str):
        if len(password) < 8:
            raise ValueError('密码至少需要 8 个字符')
        self.password_hash = pbkdf2_sha256.hash(password)

    def check_password(self, password: str) -> bool:
        return pbkdf2_sha256.verify(password, self.password_hash)

    def to_dict(self, detail: bool = False):
        data = {
            'id': self.id,
            'username': self.username,
            'role': self.role.name if self.role else None,
            'approved': self.approved,
            'created_at': self.created_at.isoformat(),
        }
        if detail:
            data['session_count'] = self.sessions.count()
            data['document_count'] = self.documents.count()
        return data

    def __repr__(self):
        return f"<User {self.username}>"


# ────────────────────────────────
# 文档
# ────────────────────────────────
class Document(db.Model, PKMixin, TimestampMixin):
    __tablename__ = 'documents'

    filename = db.Column(db.String(255), nullable=False)
    uploader_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    uploader = db.relationship(
        'User', back_populates='documents', lazy='joined'
    )

    def __repr__(self):
        return f"<Document {self.filename}>"


# ────────────────────────────────
# 对话
# ────────────────────────────────
class Session(db.Model, PKMixin, TimestampMixin):
    __tablename__ = 'sessions'

    title = db.Column(db.String(128), default='新对话')
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    user = db.relationship('User', back_populates='sessions', lazy='joined')
    messages = db.relationship(
        'Message', back_populates='session', lazy='dynamic', cascade='all, delete-orphan'
    )

    @validates('title')
    def _validate_title(self, key, title):
        return title.strip()[:128] if title and title.strip() else '新对话'

    def to_dict(self, with_count: bool = False):
        data = {
            'id': self.id,
            'title': self.title,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
        }
        if with_count:
            data['message_count'] = self.messages.count()
        return data

    def __repr__(self):
        return f"<Session {self.id}:{self.title}>"


# ────────────────────────────────
# 消息
# ────────────────────────────────
from enum import Enum

class MessageRole(str, Enum):
    USER = 'user'
    ASSISTANT = 'assistant'

class Message(db.Model, PKMixin, TimestampMixin):
    __tablename__ = 'messages'

    session_id = db.Column(db.Integer, db.ForeignKey('sessions.id'), nullable=False)
    role = db.Column(db.Enum(MessageRole), nullable=False)
    content = db.Column(db.Text, nullable=False)

    session = db.relationship('Session', back_populates='messages')

    @validates('content')
    def _validate_content(self, key, content):
        if not content or not content.strip():
            raise ValueError('内容不能为空')
        return content.strip()

    def to_dict(self):
        return {
            'id': self.id,
            'role': self.role.value,
            'content': self.content,
            'created_at': self.created_at.isoformat(),
        }

    def __repr__(self):
        return f"<Message {self.id}:{self.role.value}>"
