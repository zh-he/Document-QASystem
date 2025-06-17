import os
import shutil
from datetime import datetime

from flask import Flask, request, jsonify, render_template, redirect, url_for, flash, current_app
from flask_cors import CORS
from flask_jwt_extended import create_access_token, JWTManager, jwt_required, get_jwt_identity, create_refresh_token
from flask_login import (
    LoginManager, login_user, logout_user, login_required, current_user
)
from flask_migrate import Migrate
from langchain.docstore.document import Document as LC_Document
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from sqlalchemy import func, desc

from RAG_QA import rag_qa
from config import Config
from model import db, User, UserRole, Document, Session, Message
from text_process import TextProcessor
from vector_manager import VectorStoreManager

app = Flask(__name__)
app.config.from_object(Config)
CORS(app, supports_credentials=True)

# 初始化 Flask-JWT-Extended
jwt = JWTManager(app)

# 数据库初始化
db.init_app(app)
migrate = Migrate(app, db)

# ---------------------------
# Flask-Login 初始化
# ---------------------------
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login_page'
login_manager.session_protection = 'strong'


@login_manager.user_loader
def load_user(user_id):
    """Flask-Login 用户加载函数"""
    return User.query.get(int(user_id))


def allowed_file(filename):
    """判断上传文件是否在允许的扩展名列表中"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']


# ---------------------------
# 向量库初始化（仅第一次请求时执行）
# ---------------------------
@app.before_request
def do_init():
    """在处理请求前初始化向量库（仅执行一次）"""
    if not getattr(app, '_vector_init_done', False):
        index_path = os.path.join(app.config['VECTORSTORE_DIR'], "faiss_index")
        document_folder = os.path.join(os.path.dirname(__file__), "../document")
        VectorStoreManager.initialize(index_path=index_path, document_folder=document_folder)
        app._vector_init_done = True


# ---------------------------
# 初始化默认角色和管理员账号
# ---------------------------
@app.before_request
def create_default_roles_and_admin():
    with app.app_context():
        db.create_all()
        # 初始化三个角色：super_admin, admin, mini_user
        role_super_admin = UserRole.query.filter_by(name='super_admin').first()
        if not role_super_admin:
            role_super_admin = UserRole(name='super_admin', description='超级管理员')
            db.session.add(role_super_admin)

        role_admin = UserRole.query.filter_by(name='admin').first()
        if not role_admin:
            role_admin = UserRole(name='admin', description='普通管理员')
            db.session.add(role_admin)

        role_mini = UserRole.query.filter_by(name='mini_user').first()
        if not role_mini:
            role_mini = UserRole(name='mini_user', description='小程序用户')
            db.session.add(role_mini)

        db.session.commit()

        # 确保 admin 账户存在并且为超级管理员
        super_admin_user = User.query.filter_by(username='admin').first()
        if not super_admin_user:
            super_admin_user = User(
                username='admin',
                role=role_super_admin
            )
            super_admin_user.set_password('admin123')
            db.session.add(super_admin_user)
            db.session.commit()
            print("✅ 默认超级管理员创建成功")
        else:
            if not super_admin_user.role or super_admin_user.role.name != 'super_admin':
                super_admin_user.role = role_super_admin
                super_admin_user.approved = True
                db.session.commit()
            else:
                pass


# --------------------------------------------
# 后台管理系统
# --------------------------------------------

# ---------------------------
# 登录、退出
# ---------------------------
@app.route('/')
def index():
    """首页：若未登录 -> login，否则 -> admin_index"""
    if not current_user.is_authenticated:
        return redirect(url_for('login_page'))
    return redirect(url_for('admin_index'))


@app.route('/login', methods=['GET', 'POST'])
def login_page():
    # 若已登录直接去后台
    if current_user.is_authenticated:
        return redirect(url_for('admin_index'))

    # 仅处理 POST
    if request.method == 'POST':
        # 既兼容表单，也兼容 fetch XHR
        username = request.form.get('username')
        password = request.form.get('password')

        user = User.query.filter_by(username=username).first()
        if user and user.check_password(password):
            # mini_user 未审批阻止登录
            if user.role.name == 'mini_user' and not user.approved:
                if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                    return jsonify({"error": "该用户尚未批准"}), 403
                return render_template('login.html', error="该用户尚未批准")

            login_user(user)
            # XHR 请求返回 200 让前端自行跳转
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return jsonify({"message": "ok"}), 200
            # 普通浏览器表单：302 跳后台
            return redirect(url_for('admin_index'))

        # 账号或密码错误
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify({"error": "用户名或密码错误"}), 401
        return render_template('login.html', error="用户名或密码错误，请重试")

    # GET
    return render_template('login.html')


@app.route('/logout', methods=['GET', 'POST'])
@login_required
def logout_page():
    logout_user()
    return redirect(url_for('login_page'))


# ---------------------------
# 后台主页
# ---------------------------
@app.route('/admin')
@login_required
def admin_index():
    """后台主页"""
    if not current_user.role or current_user.role.name not in ['admin', 'super_admin']:
        return "无权访问", 403
    return render_template('admin_index.html')


# ---------------------------
# 角色管理
# ---------------------------
@app.route('/admin/users', methods=['GET'])
@login_required
def manage_users():
    pending_users = User.query.filter_by(approved=False,
                                         role_id=UserRole.query.filter_by(name='mini_user').first().id).all()
    page = request.args.get('page', 1, type=int)
    per_page = 10
    pagination = User.query.order_by(User.id.desc()).paginate(page=page, per_page=per_page, error_out=False)
    return render_template('manage_users.html', pagination=pagination, pending_users=pending_users,
                           roles=UserRole.query.all())


@app.route('/admin/users/add', methods=['POST'])
@login_required
def add_user():
    if not current_user.role or current_user.role.name != 'super_admin':
        flash('权限不足', 'danger')
        return redirect(url_for('manage_users'))
    username = request.form.get('username')
    password = request.form.get('password')
    role_id = request.form.get('role_id')
    role = UserRole.query.get(role_id) if role_id else None
    if User.query.filter_by(username=username).first():
        flash('用户名已存在', 'danger')
        return redirect(url_for('manage_users'))
    try:
        if role and role.name == 'mini_user':
            flash('小程序用户只能通过小程序注册', 'danger')
            return redirect(url_for('manage_users'))
        new_user = User(username=username)
        new_user.set_password(password)
        if role:
            new_user.role = role
            if role.name != 'mini_user':
                new_user.approved = True
            else:
                new_user.approved = False
        db.session.add(new_user)
        db.session.commit()
        flash('用户创建成功', 'success')
    except Exception as e:
        db.session.rollback()
        flash(f'创建失败: {str(e)}', 'danger')
    return redirect(url_for('manage_users'))


@app.route('/admin/users/reset_password', methods=['POST'])
@login_required
def reset_password():
    if not current_user.role or current_user.role.name != 'super_admin':
        flash('权限不足', 'danger')
    user_id = request.form.get('user_id')
    user = User.query.get(user_id)
    if not user:
        flash('用户不存在', 'danger')
        return redirect(url_for('manage_users'))
    try:
        default_password = 'Temp@1234'
        user.set_password(default_password)
        db.session.commit()
        flash(f'已重置 {user.username} 的密码为 {default_password}', 'warning')
    except Exception as e:
        db.session.rollback()
        flash('密码重置失败', 'danger')
    return redirect(url_for('manage_users'))


@app.route('/admin/users/delete', methods=['POST'])
@login_required
def delete_user():
    if not current_user.role or current_user.role.name != 'super_admin':
        flash("权限不足", "danger")
        return redirect(url_for('manage_users'))
    user_id = request.form.get('user_id')
    user = User.query.get(user_id)
    if not user:
        return "用户不存在", 404
    if user.role and user.role.name == 'super_admin':
        flash("无法删除超级管理员账户", "danger")
        return redirect(url_for('manage_users'))
    if user.id == current_user.id:
        return "无法删除当前登录用户", 400
    db.session.delete(user)
    db.session.commit()
    return redirect(url_for('manage_users'))


@app.route('/admin/users/approve', methods=['POST'])
@login_required
def approve_user():
    user_id = request.form.get('user_id')
    user = User.query.get(user_id)
    if not user:
        flash('用户不存在', 'danger')
        return redirect(url_for('manage_users'))
    user.approved = True
    db.session.commit()
    flash(f'用户 {user.username} 已批准', 'success')
    return redirect(url_for('manage_users'))


@app.route('/admin/users/reject', methods=['POST'])
@login_required
def reject_user():
    user_id = request.form.get('user_id')
    user = User.query.get(user_id)
    if not user:
        flash('用户不存在', 'danger')
        return redirect(url_for('manage_users'))
    db.session.delete(user)
    db.session.commit()
    flash(f'用户 {user.username} 已被拒绝并删除', 'danger')
    return redirect(url_for('manage_users'))


# ---------------------------
# 文档管理
# ---------------------------
@app.route('/admin/docs', methods=['GET'])
@login_required
def manage_docs():
    """文档管理页面"""
    # 确保上传目录存在（仅用于存储文件，分页和统计从 DB 来）
    doc_dir = current_app.config['UPLOAD_FOLDER']
    if not os.path.exists(doc_dir):
        os.makedirs(doc_dir)

    total_docs = Document.query.count()
    pdf_docs = Document.query.filter(Document.filename.ilike('%.pdf')).count()
    other_docs = total_docs - pdf_docs

    page = request.args.get('page', 1, type=int)
    pagination = (
        Document.query
        .order_by(Document.created_at.desc())
        .paginate(page=page, per_page=10, error_out=False)
    )

    # 3. 把所有变量传给模板
    return render_template(
        'manage_docs.html',
        total_docs=total_docs,
        pdf_docs=pdf_docs,
        other_docs=other_docs,
        pagination=pagination,
        custom_regex=request.args.get('custom_regex', '')
    )


@app.route('/admin/docs/upload', methods=['POST'])
@login_required
def upload_doc_page():
    """上传文档 & 写入向量库"""
    if not current_user.role or current_user.role.name != 'super_admin':
        flash('权限不足', 'danger')
        return redirect(url_for('manage_docs'))

    files = request.files.getlist('file')
    if not files or files[0].filename == '':
        flash('未选择文件', 'danger')
        return redirect(url_for('manage_docs'))

    new_documents = []  # 存放文本分块后的 Langchain Document 对象
    for file in files:
        filename = file.filename
        if file and allowed_file(filename):
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(file_path)
            # 保存文档记录到数据库
            new_doc = Document(
                filename=filename,
                uploader_id=current_user.id
            )
            db.session.add(new_doc)

            custom_regex = request.form.get('rag_custom_regex')
            try:
                text = TextProcessor.extract_and_process_text(file_path, custom_regex)
            except Exception as e:
                db.session.rollback()
                if os.path.exists(file_path):
                    os.remove(file_path)
                flash(f"读取文件失败: {str(e)}", "danger")
                return redirect(url_for('manage_docs'))

            splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
            docs = splitter.split_text(text)
            for chunk in docs:
                new_documents.append(LC_Document(page_content=chunk, metadata={"source": filename}))
        else:
            db.session.rollback()
            flash("文件类型不允许", "danger")
            return redirect(url_for('manage_docs'))

    try:
        VectorStoreManager.update_with_documents(new_documents)
    except Exception as e:
        db.session.rollback()
        flash(f"向量库更新失败: {str(e)}", "danger")
        return redirect(url_for('manage_docs'))

    db.session.commit()
    flash("文档上传并成功更新向量库", "success")
    return redirect(url_for('manage_docs'))


@app.route('/admin/docs/delete', methods=['POST'])
@login_required
def delete_doc_page():
    """删除文档 & 更新索引"""
    if not current_user.role or current_user.role.name != 'super_admin':
        flash('权限不足', 'danger')
        return redirect(url_for('manage_docs'))

    filename = request.form.get('filename')
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    if os.path.exists(file_path):
        os.remove(file_path)
    else:
        return "文件不存在", 404

    document = Document.query.filter_by(filename=filename).first()
    if document:
        db.session.delete(document)
        db.session.commit()
    else:
        current_app.logger.warning(f"数据库中找不到文件名为 {filename} 的记录")

    try:
        # 获取当前向量库并更新索引
        vector_db = VectorStoreManager.get_vector_store()
        docs_to_keep = [
            doc for doc in vector_db.docstore._dict.values()
            if doc.metadata.get("source") != filename
        ]
        if docs_to_keep:
            embeddings = HuggingFaceEmbeddings(model_name=app.config.get("EMBEDDING_MODEL_PATH"))
            from langchain.vectorstores import FAISS
            new_vector_store = FAISS.from_documents(docs_to_keep, embeddings)
            new_vector_store.save_local(os.path.join(app.config['VECTORSTORE_DIR'], "faiss_index"))
            VectorStoreManager.vector_store = new_vector_store
        else:
            faiss_index_folder = os.path.join(app.config['VECTORSTORE_DIR'], 'faiss_index')
            if os.path.exists(faiss_index_folder):
                shutil.rmtree(faiss_index_folder)
            VectorStoreManager.vector_store = None
    except Exception as e:
        current_app.logger.error(f"索引更新失败: {str(e)}")
        return "文件已删除，但索引更新失败", 500

    return redirect(url_for('manage_docs'))


# ---------------------------
# 角色管理
# ---------------------------
@app.route('/admin/roles', methods=['GET', 'POST'])
@login_required
def manage_roles():
    users = User.query.all()
    roles = UserRole.query.all()
    return render_template('manage_roles.html', users=users, roles=roles)


@app.route('/admin/roles/add_role', methods=['POST'])
@login_required
def add_role():
    if not current_user.role or current_user.role.name != 'super_admin':
        flash("权限不足", "danger")
        return redirect(url_for('manage_roles'))
    role_name = request.form.get('role_name')
    role_desc = request.form.get('role_desc')
    if not role_name:
        flash("角色名称不能为空", "danger")
        return redirect(url_for('manage_roles'))
    new_role = UserRole(name=role_name, description=role_desc)
    db.session.add(new_role)
    db.session.commit()
    flash("新角色添加成功", "success")
    return redirect(url_for('manage_roles'))


@app.route("/admin/roles/delete_role", methods=["POST"])
@login_required
def delete_role():
    if current_user.role.name != "super_admin":
        flash("权限不足", "danger")
        return redirect(url_for("manage_roles"))
    rid = request.form.get("role_id")
    role = UserRole.query.get(rid)
    if role and not role.users.count():
        db.session.delete(role)
        db.session.commit()
        flash("角色删除成功", "success")
    else:
        flash("角色不存在或有人使用", "warning")
    return redirect(url_for("manage_roles"))


# ---------------------------
# 后台统计
# ---------------------------
@app.route('/admin/stats/users', methods=['GET'])
@login_required
def api_stats_users():
    # 1. 查询并按日期升序
    results = (
        db.session.query(
            func.date(User.created_at).label('date'),
            func.count(User.id).label('count')
        )
        .group_by(func.date(User.created_at))
        .order_by(func.date(User.created_at))
        .all()
    )

    # 2. 构造三条数组：dates（ISO 用于计算）、labels（中文展示）、data
    dates = [r.date for r in results]  # r.date 已经是 'YYYY-MM-DD' 字符串
    labels = [
        datetime.strptime(r.date, "%Y-%m-%d").strftime("%m月%d日")
        for r in results
    ]
    data = [r.count for r in results]

    return jsonify({
        "dates": dates,
        "labels": labels,
        "data": data,
        "last_update": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    })


@app.route('/admin/stats/docs', methods=['GET'])
@login_required
def api_stats_docs():
    # 1. 查询并按日期升序
    results = (
        db.session.query(
            func.date(Document.created_at).label('date'),
            func.count(Document.id).label('count')
        )
        .group_by(func.date(Document.created_at))
        .order_by(func.date(Document.created_at))
        .all()
    )

    # 2. 构造 dates、labels、data
    dates = [r.date for r in results]
    labels = [
        datetime.strptime(r.date, "%Y-%m-%d").strftime("%m月%d日")
        for r in results
    ]
    data = [r.count for r in results]

    return jsonify({
        "dates": dates,
        "labels": labels,
        "data": data,
        "last_update": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    })


# --------------------------------------------
# 小程序
# --------------------------------------------

# ---------------------------
# 登录、退出
# ---------------------------
@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    user = User.query.filter_by(username=username).first()
    if user and user.check_password(password):
        if user.role.name == 'mini_user' and not user.approved:
            return jsonify({"error": "该用户尚未批准，无法登录"}), 403
        elif user.role.name == 'mini_user' and user.approved:
            login_user(user)
            access_token = create_access_token(identity=user.id)
            refresh_token = create_refresh_token(identity=user.id)
            return jsonify({
                "message": "登录成功",
                "role": user.role.name if user.role else None,
                "approved": user.approved,
                "access_token": access_token,
                "refresh_token": refresh_token
            }), 200
    else:
        return jsonify({"error": "无效的用户名或密码"}), 401


@app.route('/api/logout', methods=['POST'])
@jwt_required()
def api_logout():
    logout_user()
    return jsonify({"message": "Logout successful"}), 200


@app.route('/api/token/refresh', methods=['POST'])
@jwt_required(refresh=True)
def refresh_token():
    current_user_id = get_jwt_identity()
    new_access = create_access_token(identity=current_user_id)
    return jsonify({"access_token": new_access}), 200


# ---------------------------
# 注册
# ---------------------------
@app.route('/api/register', methods=['POST'])
def register():
    username = request.json.get('username')
    password = request.json.get('password')
    if not username or not password:
        return jsonify({"error": "用户名和密码不能为空"}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({"error": "用户名已存在"}), 400
    new_user = User(username=username)
    new_user.set_password(password)
    new_user.approved = False
    new_user.role = UserRole.query.filter_by(name="mini_user").first()
    try:
        db.session.add(new_user)
        db.session.commit()
        return jsonify({"message": "注册成功，等待管理员审核"}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"注册失败: {str(e)}"}), 500


# ---------------------------
# 问答
# ---------------------------
@app.route('/api/sessions/create', methods=['POST'])
@jwt_required()
def create_session():
    current_user_id = get_jwt_identity()
    user = User.query.get(current_user_id)
    if not user:
        return jsonify({"error": "用户不存在"}), 404
    first_msg = (request.json or {}).get('firstMessage', "")
    title = generate_session_title(first_msg)
    try:
        new_session = Session(
            user_id=user.id,
            title=title,
            created_at=datetime.utcnow()
        )
        db.session.add(new_session)
        db.session.commit()
        current_app.logger.info(f"New session created: {new_session.to_dict()}")
        return jsonify({
            "sessionId": new_session.id,
            "title": title,
            "createdAt": new_session.created_at.isoformat()
        }), 201
    except Exception as e:
        return jsonify({
            "error": "创建会话失败，请稍后再试",
            "details": str(e)
        }), 500


def generate_session_title(message_content):
    title_length = 8
    title = message_content[:title_length]
    if len(message_content) > title_length:
        title += "..."
    return title or "新对话"


@app.route('/api/chat', methods=['POST'])
@jwt_required()
def api_query():
    current_app.logger.info("api_query: 请求开始")
    current_user_id = get_jwt_identity()
    user = User.query.get(current_user_id)
    if not user:
        current_app.logger.warning(f"api_query: 用户不存在: user_id={current_user_id}")
        return jsonify({"error": "用户不存在"}), 404
    user_role = user.role.name if user.role else None
    if user_role == 'mini_user':
        if not user.approved:
            current_app.logger.warning(f"api_query: 用户未批准: username={user.username}, approved={user.approved}")
            return jsonify({"error": "You are not approved yet"}), 403
    elif user_role not in ['admin', 'super_admin']:
        current_app.logger.warning(f"api_query: 用户权限不足: username={user.username}, role={user_role}")
        return jsonify({"error": "No permission"}), 403

    try:
        # 确保向量库已初始化
        vector_db = VectorStoreManager.get_vector_store()
    except ValueError as e:
        current_app.logger.error("api_query: 向量数据库未初始化")
        return jsonify({"error": "No documents available. Please upload documents first."}), 400

    data = request.json
    question = data.get('question')
    session_id = data.get('sessionId')
    current_app.logger.info(f"api_query: 接收到请求数据: question='{question}', sessionId='{session_id}'")
    if not question:
        current_app.logger.warning("api_query: 问题为空")
        return jsonify({"error": "No question provided"}), 400
    if not session_id:
        current_app.logger.warning("api_query: sessionId 为空")
        return jsonify({"error": "No sessionId provided"}), 400

    try:
        answer = rag_qa(question)
    except Exception as qa_error:
        current_app.logger.error(f"api_query: 调用 QA 链出错: {qa_error}")
        return jsonify({"error": f"AI 问答服务出错: {qa_error}"}), 500

    session = Session.query.get(session_id)
    if not session:
        current_app.logger.warning(f"api_query: 会话不存在: sessionId={session_id}")
        return jsonify({"error": "无效的 sessionId"}), 404
    current_app.logger.info(
        f"api_query: 会话信息: sessionId={session.id}, title='{session.title}', user_id={session.user_id}")

    try:
        user_message = Message(
            session_id=session_id,
            role='user',
            content=question
        )
        bot_message = Message(
            session_id=session_id,
            role='assistant',
            content=answer
        )
        db.session.add_all([user_message, bot_message])
        current_app.logger.info("api_query: 成功添加到 session")
        if session.messages.count() == 0:
            session_title = generate_session_title(question)
            session.title = session_title
        db.session.commit()
        current_app.logger.info("api_query: 成功 commit 到数据库")
    except Exception as db_error:
        db.session.rollback()
        current_app.logger.error(f"api_query: 数据库写入错误: {db_error}")
        current_app.logger.error(f"api_query: 写入错误时 user_message 对象: {user_message}")
        current_app.logger.error(f"api_query: 写入错误时 bot_message 对象: {bot_message}")
        return jsonify({"error": f"数据库错误: {db_error}"}), 500

    session.updated_at = datetime.utcnow()
    db.session.commit()
    current_app.logger.info("api_query: 成功更新 session.updated_at 并 commit")
    current_app.logger.info("api_query: 请求处理完成，准备返回响应")
    return jsonify({"answer": answer}), 200


@app.route('/api/sessions', methods=['GET'])
@jwt_required()
def get_sessions():
    current_user_id = get_jwt_identity()
    user = User.query.get(current_user_id)
    if not user:
        return jsonify({"error": "用户不存在"}), 404
    try:
        sessions = Session.query.filter_by(user_id=user.id) \
            .order_by(desc(Session.created_at)) \
            .all()
        return jsonify({
            "sessions": [{
                "id": session.id,
                "title": session.title or "新对话",
                "created_at": session.created_at.isoformat()
            } for session in sessions]
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/sessions/<int:session_id>', methods=['GET'])
@jwt_required()
def get_session_messages(session_id):
    current_user_id = get_jwt_identity()
    user = User.query.get(current_user_id)
    if not user:
        return jsonify({"error": "用户不存在"}), 404
    try:
        session = Session.query.filter_by(id=session_id, user_id=user.id).first()
        if not session:
            return jsonify({"error": "会话不存在"}), 404
        messages = Message.query.filter_by(session_id=session_id) \
            .order_by(Message.created_at.asc()) \
            .all()
        return jsonify({
            "messages": [{
                "id": msg.id,
                "role": msg.role,
                "content": msg.content,
                "created_at": msg.created_at.isoformat()
            } for msg in messages]
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/sessions/<int:session_id>/delete', methods=['POST'])
@jwt_required()
def delete_session(session_id):
    current_user_id = get_jwt_identity()
    user = User.query.get(current_user_id)
    if not user:
        return jsonify({"error": "用户不存在"}), 404
    try:
        session = Session.query.filter_by(id=session_id, user_id=user.id).first()
        if not session:
            return jsonify({"error": "会话不存在"}), 404
        Message.query.filter_by(session_id=session_id).delete()
        db.session.delete(session)
        db.session.commit()
        return jsonify({"message": "会话已删除"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@app.route('/api/sessions/<int:session_id>/rename', methods=['POST'])
@jwt_required()
def rename_session(session_id):
    current_user_id = get_jwt_identity()
    user = User.query.get(current_user_id)
    if not user:
        return jsonify({"error": "用户不存在"}), 404
    try:
        new_title = request.json.get('title')
        if not new_title:
            return jsonify({"error": "标题不能为空"}), 400
        session = Session.query.filter_by(id=session_id, user_id=user.id).first()
        if not session:
            return jsonify({"error": "会话不存在"}), 404
        session.title = new_title
        db.session.commit()
        return jsonify({"message": "会话已重命名"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


# ---------------------------
# 我的
# ---------------------------
@app.route('/api/profile', methods=['GET'])
@jwt_required()
def get_profile():
    current_user_id = get_jwt_identity()
    user = User.query.get(current_user_id)
    if not user:
        return jsonify({"error": "用户不存在"}), 404
    document_names = []
    for filename in os.listdir(os.path.join(os.curdir, "documents")):
        document_names.append(filename)
    return jsonify({
        "username": user.username,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "document_names": document_names,
    }), 200


@app.route('/api/profile/password', methods=['POST'])
@jwt_required()
def change_password():
    current_user_id = get_jwt_identity()
    user = User.query.get(current_user_id)
    if not user:
        return jsonify({"success": False, "error": "用户不存在"}), 200
    data = request.get_json() or {}
    old_password = data.get('oldPassword')
    new_password = data.get('newPassword')
    if not old_password or not new_password:
        return jsonify({"success": False, "error": "密码不能为空"}), 200
    if not user.check_password(old_password):
        return jsonify({"success": False, "error": "原密码错误"}), 200
    try:
        user.set_password(new_password)
        db.session.commit()
        return jsonify({"success": True, "message": "密码修改成功"}), 200
    except ValueError as ve:
        db.session.rollback()
        return jsonify({"success": False, "error": f"新密码设置失败: {str(ve)}"}), 200
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"change_password: 密码修改失败 (服务器错误), user_id={user.id}, error={str(e)}")
        return jsonify({"success": False, "error": "服务器错误，请稍后重试"}), 200


if __name__ == '__main__':
    app.run(debug=True, use_reloader=False, port=8000)
