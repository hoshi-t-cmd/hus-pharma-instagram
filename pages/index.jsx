import { useState, useRef } from "react";

// ══════════════════════════════════════════════════════
// ⚙️ 設定（ここを環境に合わせて変更）
// ══════════════════════════════════════════════════════
const DRIVE_ROOT_FOLDER_ID = "1iwjP43WgHlY2YqZHV37iUUeLSHFBhZgY"; // 薬学部Instagram素材フォルダ

// サブフォルダID（Drive上で作成後、各IDをここに入力）
const FOLDER_IDS = {
  campus:   "1bhOMhV1E0LRboR9bm7QkoNokGvFveNN4",  // 01_日々の学生生活
  learning: "1WsP-gLLH78N4OJh3TOf6WMkt6zzYxhn",   // 02_学びの魅力
  people:   "1-bQWBFkWobHyiuLvMH9iOn-EDDxcNmwH",  // 03_人物・インタビュー
  event:    "1FZfMQhmZ-D48gLDJnW40o8-J7zIBiOgK",  // 04_イベント
  season:   "1zZvFZ11GK2q32zjLSiuWttjxoVHRqR9E",  // 05_季節ネタ
};

// Google OAuth クライアントID（Google Cloud Consoleで取得）
const GOOGLE_CLIENT_ID = "308367687032-989psduojc2vkfu6mc5etc4qrq7i0cge.apps.googleusercontent.com";
const GOOGLE_SCOPES = "https://www.googleapis.com/auth/drive.file";
// ══════════════════════════════════════════════════════

const CATEGORIES = [
  { id: "campus",   label: "日々の学生生活",     emoji: "🏫", folderName: "01_日々の学生生活",     sub: ["キャンパス風景","食堂・施設","サークル活動","学生の1日","持ち物紹介"] },
  { id: "learning", label: "学びの魅力",         emoji: "📚", folderName: "02_学びの魅力",         sub: ["授業風景","実験・実習","研究活動","国家試験勉強","実務実習"] },
  { id: "people",   label: "人物・インタビュー", emoji: "🎓", folderName: "03_人物・インタビュー", sub: ["在学生インタビュー","教員紹介","卒業生の声","薬学生あるある"] },
  { id: "event",    label: "イベント",           emoji: "🎉", folderName: "04_イベント",           sub: ["オープンキャンパス","大学祭","入試関連","クラスミーティング"] },
  { id: "season",   label: "季節ネタ",           emoji: "🌿", folderName: "05_季節ネタ",           sub: ["薬草園","野菜収穫・苗植え","キャンパスイルミネーション","入学式・卒業式"] },
];

const CHECKLIST = [
  { id: "face",       label: "背景に顔・車ナンバー等、個人が特定できるものは写っていない" },
  { id: "secret",     label: "ホワイトボード・PC画面に機密情報・研究データは写っていない" },
  { id: "safety",     label: "実験着・保護メガネ等、安全・衛生ルールが守られている" },
  { id: "permission", label: "写り込んだ人物から掲載許可を得た（または顔が映っていない）" },
  { id: "vertical",   label: "縦構図で撮影されている" },
  { id: "quality",    label: "写真が明るく・ブレていない" },
];

const INITIAL_USERS = [
  { id: "s2024001", name: "山田 太郎", year: 2, pw: "pass001", role: "student", active: true },
  { id: "s2024002", name: "鈴木 花子", year: 3, pw: "pass002", role: "student", active: true },
  { id: "s2024003", name: "佐藤 健太", year: 1, pw: "pass003", role: "student", active: true },
  { id: "t001",     name: "星 先生",   year: null, pw: "teacher2024", role: "teacher", active: true },
  { id: "t002", name: "山下 先生", year: null, pw: "teacher2024", role: "teacher", active: true },
  { id: "t003", name: "神尾 先生", year: null, pw: "teacher2024", role: "teacher", active: true },
];

function genFileName(date, catId, sub, userId, userName) {
  const d = (date || new Date().toISOString().slice(0,10)).replace(/-/g,"");
  const subSlug = (sub || "misc").replace(/[・\s]/g,"_").slice(0,8);
  const nameSlug = (userName || "").replace(/\s/g,"").slice(0,4);
  const rand = Math.random().toString(36).slice(2,5);
  return `${d}_${catId}_${subSlug}_${userId}_${nameSlug}_${rand}.jpg`;
}

// ── Google Drive アップロード ────────────────────────────────
async function uploadToDrive(file, fileName, folderId, accessToken) {
  // 1. ファイルメタデータ
  const metadata = {
    name: fileName,
    parents: [folderId || DRIVE_ROOT_FOLDER_ID],
  };

  // 2. multipart upload
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", file);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    }
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || "Drive upload failed");
  }
  return await res.json(); // { id, name, webViewLink }
}

// ── Google OAuth（暗黙フロー） ──────────────────────────────
function useGoogleAuth() {
  const [token, setToken] = useState(null);
  const [authError, setAuthError] = useState("");

  function signIn() {
    if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID.includes("YOUR_CLIENT")) {
      setAuthError("GOOGLE_CLIENT_ID が未設定です。手順書を参照して設定してください。");
      return;
    }
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: window.location.origin,
      response_type: "token",
      scope: GOOGLE_SCOPES,
      prompt: "select_account",
    });
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  // リダイレクト後のトークン取得
  useState(() => {
    const hash = window.location.hash;
    if (hash.includes("access_token")) {
      const params = new URLSearchParams(hash.slice(1));
      const t = params.get("access_token");
      if (t) {
        setToken(t);
        // URLからトークンを除去
        window.history.replaceState(null, "", window.location.pathname);
      }
    }
  });

  return { token, signIn, authError };
}

// ── 共通スタイル ────────────────────────────────────────────
const S = {
  input: { width:"100%", padding:"11px 14px", borderRadius:10, border:"1.5px solid #E0E0E0", fontSize:14, outline:"none", background:"#fff", color:"#1A1A1A", boxSizing:"border-box" },
  btn:   { display:"block", width:"100%", padding:"13px", borderRadius:11, border:"none", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"inherit" },
};

function Field({ label, req, children, hint }) {
  return (
    <div style={{ marginBottom:14 }}>
      <label style={{ fontSize:13, fontWeight:700, color:"#333", display:"block", marginBottom:5 }}>
        {label}{req && <span style={{ color:"#C44" }}> *</span>}
      </label>
      {children}
      {hint && <p style={{ fontSize:11, color:"#999", marginTop:4 }}>{hint}</p>}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 🔐 ログイン
// ══════════════════════════════════════════════════════
function LoginScreen({ users, onLogin }) {
  const [uid, setUid] = useState("");
  const [pw, setPw]   = useState("");
  const [err, setErr] = useState("");
  const [shake, setShake] = useState(false);

  function login() {
    const user = users.find(u => u.id === uid.trim() && u.pw === pw && u.active);
    if (user) { onLogin(user); return; }
    setErr(users.find(u=>u.id===uid.trim()) ? "パスワードが正しくありません" : "IDが見つかりません");
    setShake(true); setTimeout(()=>setShake(false), 500);
    setPw("");
  }

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(155deg,#0C2340 0%,#1A4A3A 100%)", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Noto Sans JP','Hiragino Sans',sans-serif", padding:20 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700;900&display=swap');*{box-sizing:border-box;}@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}@keyframes up{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}.lcard{animation:up 0.45s ease forwards;}.fin:focus{border-color:#3D7A5A!important;box-shadow:0 0 0 3px rgba(61,122,90,.2);}`}</style>
      <div className="lcard" style={{ background:"#fff", borderRadius:24, padding:"44px 32px", width:"100%", maxWidth:380, boxShadow:"0 24px 60px rgba(0,0,0,.4)", animation:shake?"shake 0.5s ease":undefined }}>
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <div style={{ fontSize:48, marginBottom:8 }}>💊</div>
          <div style={{ fontSize:11, fontWeight:700, color:"#3D7A5A", letterSpacing:"0.1em", marginBottom:4 }}>北海道科学大学薬学部</div>
          <h1 style={{ fontSize:18, fontWeight:900, color:"#1A1A1A", lineHeight:1.4 }}>Instagram 写真共有<br/>管理システム</h1>
        </div>
        <Field label="ユーザーID" req>
          <input className="fin" value={uid} onChange={e=>setUid(e.target.value)} onKeyDown={e=>e.key==="Enter"&&login()} placeholder="例：s2024001" style={{ ...S.input, border:`1.5px solid ${err?"#C44":"#E0E0E0"}` }} />
        </Field>
        <Field label="パスワード" req>
          <input className="fin" type="password" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&login()} placeholder="パスワードを入力" style={{ ...S.input, border:`1.5px solid ${err?"#C44":"#E0E0E0"}` }} />
          {err && <p style={{ fontSize:12, color:"#C44", marginTop:5 }}>❌ {err}</p>}
        </Field>
        <button onClick={login} style={{ ...S.btn, background:"#1A1A1A", marginBottom:20 }}>ログイン →</button>
        <div style={{ borderTop:"1px solid #F0F0F0", paddingTop:14 }}>
          <p style={{ fontSize:11, color:"#AAA", marginBottom:8, textAlign:"center" }}>🔑 デモ用アカウント</p>
          <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
            {users.filter(u=>u.active).map(u=>(
              <button key={u.id} onClick={()=>{setUid(u.id);setPw(u.pw);setErr("");}} style={{ padding:"7px 12px", borderRadius:8, border:"1.5px solid #EEE", background:"#FAFAFA", cursor:"pointer", fontFamily:"inherit", display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:12, color:"#444" }}>
                <span>{u.role==="teacher"?"👩‍🏫":"📸"} {u.name}{u.year?` （${u.year}年生）`:""}</span>
                <code style={{ fontSize:11, color:"#3D7A5A" }}>{u.id}</code>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 📸 学生：写真投稿フォーム
// ══════════════════════════════════════════════════════
function SubmitForm({ user, photos, onSubmit, onLogout }) {
  const [view, setView]     = useState("form");
  const [step, setStep]     = useState(1);
  const [file, setFile]     = useState(null);
  const [preview, setPreview] = useState(null);
  const [catId, setCatId]   = useState("");
  const [sub, setSub]       = useState("");
  const [memo, setMemo]     = useState("");
  const [dt, setDt]         = useState(() => new Date().toISOString().slice(0,16));
  const [checks, setChecks] = useState({});
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null); // { driveFileId, driveLink, fileName }
  const [uploadError, setUploadError]   = useState("");
  const [newPw, setNewPw]   = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [pwMsg, setPwMsg]   = useState("");
  const fileRef = useRef();
  const { token, signIn, authError } = useGoogleAuth();

  const myPhotos = photos.filter(p => p.userId === user.id);
  const cat = CATEGORIES.find(c => c.id === catId);
  const allChecked = CHECKLIST.every(i => checks[i.id]);
  const fileName = file ? genFileName(dt?.slice(0,10), catId, sub, user.id, user.name) : "";
  const folderId = FOLDER_IDS[catId] || DRIVE_ROOT_FOLDER_ID;
  const drivePath = cat ? `薬学部Instagram素材 / ${cat.folderName}` : "薬学部Instagram素材";

  function onFile(e) {
    const f = e.target.files?.[0]; if (!f) return;
    setFile(f);
    const r = new FileReader();
    r.onload = ev => { setPreview(ev.target.result); setStep(2); };
    r.readAsDataURL(f);
  }

  async function submit() {
    setUploading(true);
    setUploadError("");
    let driveResult = null;

    // Google Drive へアップロード
    if (token && file) {
      try {
        driveResult = await uploadToDrive(file, fileName, folderId, token);
      } catch (e) {
        setUploadError(`Drive upload 失敗: ${e.message}`);
        setUploading(false);
        return;
      }
    }

    onSubmit({
      id: Date.now(),
      preview,
      userId: user.id, userName: user.name, userYear: user.year,
      catId, catLabel: cat?.label, catEmoji: cat?.emoji,
      sub, memo, dt, fileName, drivePath,
      driveFileId:  driveResult?.id || null,
      driveLink:    driveResult?.webViewLink || null,
      driveUploaded: !!driveResult,
      submittedAt: new Date().toLocaleString("ja-JP"),
      status: "pending", comment: "",
    });

    setUploadResult(driveResult);
    setUploading(false);
    setStep(4);
  }

  function resetForm() {
    setStep(1); setFile(null); setPreview(null);
    setCatId(""); setSub(""); setMemo(""); setChecks({});
    setDt(new Date().toISOString().slice(0,16));
    setUploadResult(null); setUploadError("");
  }

  const STATUS_COLOR = { pending:"#E8A020", approved:"#3D7A5A", rejected:"#C44" };
  const STATUS_LABEL = { pending:"確認待ち", approved:"✅ 承認済み", rejected:"❌ 却下" };

  return (
    <div style={{ minHeight:"100vh", background:"#F5F5F3", fontFamily:"'Noto Sans JP','Hiragino Sans',sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700;900&display=swap');*{box-sizing:border-box;margin:0;padding:0;}input,textarea,button,select{font-family:inherit;}@keyframes fi{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}.fi{animation:fi 0.3s ease forwards;}.fin:focus{border-color:#3D7A5A!important;outline:none;}`}</style>

      {/* Header */}
      <header style={{ background:"#fff", borderBottom:"1px solid #EBEBEB", padding:"0 16px", height:56, display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:100 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:22 }}>💊</span>
          <div>
            <div style={{ fontSize:13, fontWeight:900 }}>薬学部 写真共有</div>
            <div style={{ fontSize:10, color:"#888" }}>📸 {user.name}（{user.year}年生）</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:6 }}>
          {/* Google認証ボタン */}
          {!token ? (
            <button onClick={signIn} style={{ fontSize:11, padding:"5px 10px", borderRadius:6, border:"1.5px solid #3D7A5A", background:"#EEF7F2", color:"#3D7A5A", cursor:"pointer", fontWeight:700 }}>
              🔗 Googleと連携
            </button>
          ) : (
            <span style={{ fontSize:11, padding:"5px 10px", borderRadius:6, background:"#EEF7F2", color:"#3D7A5A", fontWeight:700 }}>✅ Drive連携中</span>
          )}
          <button onClick={()=>setView("mypage")} style={{ fontSize:12, padding:"5px 10px", borderRadius:6, border:"1.5px solid #EEE", background:view==="mypage"?"#1A1A1A":"#fff", color:view==="mypage"?"#fff":"#555", cursor:"pointer" }}>👤 マイページ</button>
          <button onClick={()=>{setView("form");resetForm();}} style={{ fontSize:12, padding:"5px 10px", borderRadius:6, border:"1.5px solid #EEE", background:view==="form"?"#1A1A1A":"#fff", color:view==="form"?"#fff":"#555", cursor:"pointer" }}>📸 投稿</button>
          <button onClick={onLogout} style={{ fontSize:12, padding:"5px 10px", borderRadius:6, border:"1.5px solid #EEE", background:"#fff", color:"#888", cursor:"pointer" }}>ログアウト</button>
        </div>
      </header>

      {/* Google認証エラー */}
      {authError && (
        <div style={{ background:"#FFF0F0", borderLeft:"4px solid #C44", padding:"10px 16px", fontSize:13, color:"#C44" }}>
          ⚠️ {authError}
        </div>
      )}

      {/* Drive未連携バナー */}
      {!token && view==="form" && (
        <div style={{ background:"#FFF8E1", borderLeft:"4px solid #E8A020", padding:"10px 16px", fontSize:13, color:"#7A6000", display:"flex", alignItems:"center", gap:8 }}>
          ⚠️ Google Drive に写真を保存するには「Googleと連携」ボタンを押してください
          <button onClick={signIn} style={{ fontSize:12, padding:"4px 12px", borderRadius:6, border:"1.5px solid #E8A020", background:"#fff", color:"#7A6000", cursor:"pointer", fontFamily:"inherit" }}>連携する</button>
        </div>
      )}

      {/* マイページ */}
      {view==="mypage" && (
        <div className="fi" style={{ maxWidth:480, margin:"0 auto", padding:"24px 16px 80px" }}>
          <div style={{ background:"#fff", borderRadius:14, border:"1.5px solid #EEE", padding:"20px", marginBottom:14 }}>
            <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:16 }}>
              <div style={{ width:52, height:52, borderRadius:"50%", background:"linear-gradient(135deg,#1A4A3A,#3D7A5A)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, color:"#fff", fontWeight:900 }}>{user.name[0]}</div>
              <div>
                <div style={{ fontSize:16, fontWeight:900 }}>{user.name}</div>
                <div style={{ fontSize:12, color:"#888" }}>{user.id} · {user.year}年生</div>
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
              {[["提供数",myPhotos.length,"#1A1A1A"],["承認",myPhotos.filter(p=>p.status==="approved").length,"#3D7A5A"],["確認待ち",myPhotos.filter(p=>p.status==="pending").length,"#E8A020"]].map(([l,v,c])=>(
                <div key={l} style={{ background:"#F7F7F7", borderRadius:10, padding:"12px 0", textAlign:"center" }}>
                  <div style={{ fontSize:22, fontWeight:900, color:c }}>{v}</div>
                  <div style={{ fontSize:11, color:"#888", marginTop:2 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* パスワード変更 */}
          <div style={{ background:"#fff", borderRadius:14, border:"1.5px solid #EEE", padding:"14px 16px", marginBottom:14 }}>
            <button onClick={()=>setView(view==="changepw"?"mypage":"changepw")} style={{ background:"none", border:"none", cursor:"pointer", fontSize:13, fontWeight:700, color:"#555", padding:0 }}>
              🔑 パスワードを変更 {view==="changepw"?"▲":"▼"}
            </button>
            {view==="changepw" && (
              <div style={{ marginTop:10 }}>
                <Field label="新しいパスワード"><input type="password" value={newPw} onChange={e=>setNewPw(e.target.value)} placeholder="6文字以上" style={S.input} /></Field>
                <Field label="確認（再入力）"><input type="password" value={newPw2} onChange={e=>setNewPw2(e.target.value)} placeholder="もう一度入力" style={S.input} /></Field>
                {pwMsg && <p style={{ fontSize:12, color:pwMsg.includes("✅")?"#3D7A5A":"#C44", marginBottom:8 }}>{pwMsg}</p>}
                <button onClick={()=>{ if(!newPw||newPw.length<6){setPwMsg("❌ 6文字以上");return;} if(newPw!==newPw2){setPwMsg("❌ 一致しません");return;} setPwMsg("✅ 変更しました"); setNewPw(""); setNewPw2(""); }} style={{ ...S.btn, background:"#1A1A1A", padding:"11px" }}>変更する</button>
              </div>
            )}
          </div>

          <h3 style={{ fontSize:14, fontWeight:700, marginBottom:8, paddingLeft:2 }}>📋 投稿履歴</h3>
          {myPhotos.length===0 ? (
            <div style={{ textAlign:"center", padding:"40px 0", color:"#CCC", fontSize:14 }}>まだ写真を提供していません</div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {myPhotos.map(p=>(
                <div key={p.id} style={{ background:"#fff", borderRadius:12, border:"1.5px solid #EEE", display:"flex", gap:12, padding:"12px 14px" }}>
                  {p.preview && <img src={p.preview} alt="" style={{ width:52, height:70, objectFit:"cover", borderRadius:7, flexShrink:0 }} />}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                      <span style={{ fontSize:12, fontWeight:700 }}>{p.catEmoji} {p.catLabel}</span>
                      <span style={{ fontSize:11, padding:"2px 8px", borderRadius:10, background:STATUS_COLOR[p.status]+"20", color:STATUS_COLOR[p.status], fontWeight:700 }}>{STATUS_LABEL[p.status]}</span>
                    </div>
                    {p.sub && <div style={{ fontSize:11, color:"#888", marginBottom:2 }}>{p.sub}</div>}
                    <div style={{ fontSize:11, color:"#AAA" }}>{p.submittedAt}</div>
                    {/* Drive保存リンク */}
                    {p.driveLink && (
                      <a href={p.driveLink} target="_blank" rel="noreferrer" style={{ fontSize:11, color:"#3D7A5A", textDecoration:"none", display:"inline-flex", alignItems:"center", gap:3, marginTop:3 }}>
                        📁 Driveで見る →
                      </a>
                    )}
                    {p.comment && <div style={{ marginTop:5, fontSize:11, color:"#555", background:"#FFF8E1", borderRadius:6, padding:"4px 8px" }}>💬 {p.comment}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 投稿フォーム */}
      {(view==="form"||view==="changepw") && (
        <div className="fi" style={{ maxWidth:420, margin:"0 auto", padding:"0 0 80px" }}>
          {step<4 && (
            <div style={{ display:"flex", padding:"16px 20px 4px" }}>
              {["写真","情報","確認"].map((l,i)=>{
                const n=i+1, done=step>n, active=step===n;
                return (
                  <div key={n} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center" }}>
                    <div style={{ display:"flex", alignItems:"center", width:"100%" }}>
                      {i>0 && <div style={{ flex:1, height:2, background:done?"#3D7A5A":"#DDD" }} />}
                      <div style={{ width:28, height:28, borderRadius:"50%", flexShrink:0, background:done?"#3D7A5A":active?"#1A1A1A":"#DDD", color:done||active?"#fff":"#999", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700 }}>{done?"✓":n}</div>
                      {i<2 && <div style={{ flex:1, height:2, background:step>n?"#3D7A5A":"#DDD" }} />}
                    </div>
                    <span style={{ fontSize:10, color:active?"#1A1A1A":"#999", marginTop:4, fontWeight:active?700:400 }}>{l}</span>
                  </div>
                );
              })}
            </div>
          )}

          {step===1 && (
            <div style={{ padding:"24px 20px" }}>
              <div style={{ background:"#EEF7F2", borderRadius:10, padding:"10px 14px", marginBottom:18, display:"flex", alignItems:"center", gap:8, fontSize:13 }}>
                <span style={{ fontSize:18 }}>👤</span>
                <span><strong>{user.name}</strong>（{user.id}）として送信されます</span>
              </div>
              <h2 style={{ fontSize:20, fontWeight:800, marginBottom:6 }}>📸 写真を選ぶ</h2>
              <p style={{ fontSize:13, color:"#666", marginBottom:18, lineHeight:1.6 }}>縦構図で撮影した写真をアップロードしてください</p>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display:"none" }} />
              <button onClick={()=>fileRef.current?.click()} style={{ width:"100%", aspectRatio:"9/16", maxHeight:360, borderRadius:20, border:"2.5px dashed #CCC", background:"#FAFAFA", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:12, color:"#999", fontFamily:"inherit" }}>
                <span style={{ fontSize:52 }}>📷</span>
                <span style={{ fontSize:15, fontWeight:700 }}>写真を選択 / 撮影</span>
                <span style={{ fontSize:12 }}>縦構図推奨</span>
              </button>
            </div>
          )}

          {step===2 && (
            <div style={{ padding:"20px 20px" }}>
              <div style={{ display:"flex", gap:12, marginBottom:18, alignItems:"flex-start" }}>
                {preview && <img src={preview} alt="" style={{ width:60, height:80, objectFit:"cover", borderRadius:8, flexShrink:0 }} />}
                <div>
                  <h2 style={{ fontSize:18, fontWeight:800, marginBottom:2 }}>情報を入力</h2>
                  <div style={{ fontSize:12, color:"#3D7A5A", background:"#EEF7F2", borderRadius:6, padding:"3px 8px", display:"inline-block", marginBottom:4 }}>👤 {user.name}（{user.id}）</div><br/>
                  <button onClick={()=>{setFile(null);setPreview(null);setStep(1);}} style={{ fontSize:11, color:"#999", background:"none", border:"none", cursor:"pointer", padding:0, textDecoration:"underline" }}>写真を変更</button>
                </div>
              </div>

              <Field label="撮影日時" req>
                <input type="datetime-local" value={dt} onChange={e=>setDt(e.target.value)} style={S.input} />
              </Field>

              <Field label="カテゴリ" req>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  {CATEGORIES.map(c=>(
                    <button key={c.id} onClick={()=>{setCatId(c.id);setSub("");}} style={{ padding:"10px 8px", borderRadius:10, border:`2px solid ${catId===c.id?"#1A1A1A":"#E0E0E0"}`, background:catId===c.id?"#1A1A1A":"#fff", color:catId===c.id?"#fff":"#333", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit", textAlign:"left", display:"flex", alignItems:"center", gap:5 }}>
                      <span>{c.emoji}</span>{c.label}
                    </button>
                  ))}
                </div>
              </Field>

              {cat && (
                <Field label="シーン">
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                    {cat.sub.map(s=>(
                      <button key={s} onClick={()=>setSub(s)} style={{ padding:"6px 12px", borderRadius:20, border:`1.5px solid ${sub===s?"#3D7A5A":"#DDD"}`, background:sub===s?"#3D7A5A":"#fff", color:sub===s?"#fff":"#555", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>{s}</button>
                    ))}
                  </div>
                </Field>
              )}

              <Field label="メモ（任意）">
                <textarea value={memo} onChange={e=>setMemo(e.target.value)} placeholder="撮影状況など" rows={3} style={{ ...S.input, resize:"none" }} />
              </Field>

              {catId && (
                <div style={{ background:"#EEF7F2", borderRadius:10, padding:12, marginBottom:14 }}>
                  <div style={{ fontSize:11, color:"#3D7A5A", fontWeight:700, marginBottom:4 }}>📁 保存先（自動）</div>
                  <div style={{ fontSize:11, color:"#555", marginBottom:2 }}>📂 {drivePath}</div>
                  <code style={{ fontSize:11, color:"#1A1A1A", wordBreak:"break-all" }}>{fileName}</code>
                </div>
              )}

              <button onClick={()=>setStep(3)} disabled={!catId||!dt} style={{ ...S.btn, background:catId&&dt?"#1A1A1A":"#CCC", cursor:catId&&dt?"pointer":"not-allowed" }}>確認へ →</button>
            </div>
          )}

          {step===3 && (
            <div style={{ padding:"20px 20px" }}>
              <h2 style={{ fontSize:20, fontWeight:800, marginBottom:4 }}>投稿前チェック</h2>
              <p style={{ fontSize:13, color:"#666", marginBottom:14, lineHeight:1.6 }}>全項目を確認してください</p>
              <div style={{ background:"#F7F7F7", borderRadius:10, padding:"10px 12px", marginBottom:14, fontSize:12, color:"#555", lineHeight:1.9 }}>
                <div>👤 {user.name}（{user.id}）</div>
                <div>{cat?.emoji} {cat?.label}{sub?` › ${sub}`:""}</div>
                <div>🕐 {dt?.replace("T"," ")}</div>
                <div>📁 {drivePath}</div>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:18 }}>
                {CHECKLIST.map(item=>(
                  <label key={item.id} style={{ display:"flex", gap:12, alignItems:"flex-start", background:checks[item.id]?"#EEF7F2":"#FAFAFA", border:`1.5px solid ${checks[item.id]?"#3D7A5A":"#E0E0E0"}`, borderRadius:10, padding:"11px 12px", cursor:"pointer" }}>
                    <input type="checkbox" checked={!!checks[item.id]} onChange={e=>setChecks(p=>({...p,[item.id]:e.target.checked}))} style={{ width:17, height:17, marginTop:2, flexShrink:0, accentColor:"#3D7A5A" }} />
                    <span style={{ fontSize:13, lineHeight:1.5, color:checks[item.id]?"#1A1A1A":"#555" }}>{item.label}</span>
                  </label>
                ))}
              </div>
              {uploadError && <div style={{ background:"#FFF0F0", borderRadius:10, padding:10, marginBottom:10, fontSize:12, color:"#C44" }}>❌ {uploadError}</div>}
              {!allChecked && <div style={{ background:"#FFF8E1", borderRadius:10, padding:10, marginBottom:10, fontSize:12, color:"#7A6000" }}>⚠️ 全項目チェック後に送信できます</div>}
              <button onClick={submit} disabled={!allChecked||uploading} style={{ ...S.btn, background:allChecked&&!uploading?"#3D7A5A":"#CCC", cursor:allChecked&&!uploading?"pointer":"not-allowed", marginBottom:8, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                {uploading ? <><span style={{ display:"inline-block", width:16, height:16, border:"2px solid rgba(255,255,255,.4)", borderTopColor:"#fff", borderRadius:"50%", animation:"spin 0.8s linear infinite" }}></span>Driveに保存中...</> : "✅ 送信してDriveに保存"}
              </button>
              <button onClick={()=>setStep(2)} style={{ ...S.btn, background:"#EEE", color:"#555" }}>← 戻る</button>
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          )}

          {step===4 && (
            <div style={{ padding:"60px 20px", textAlign:"center" }}>
              <div style={{ fontSize:64, marginBottom:14 }}>🎉</div>
              <h2 style={{ fontSize:22, fontWeight:800, marginBottom:8 }}>送信完了！</h2>
              {uploadResult ? (
                <div style={{ background:"#EEF7F2", borderRadius:12, padding:16, marginBottom:20, textAlign:"left" }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#3D7A5A", marginBottom:8 }}>✅ Google Drive に保存されました</div>
                  <div style={{ fontSize:12, color:"#555", marginBottom:4 }}>📂 {drivePath}</div>
                  <code style={{ fontSize:11, wordBreak:"break-all", display:"block", marginBottom:8 }}>{fileName}</code>
                  <a href={uploadResult.webViewLink} target="_blank" rel="noreferrer" style={{ fontSize:12, color:"#3D7A5A", textDecoration:"none", fontWeight:700 }}>📁 Driveで確認する →</a>
                </div>
              ) : (
                <div style={{ background:"#FFF8E1", borderRadius:12, padding:14, marginBottom:20, textAlign:"left" }}>
                  <div style={{ fontSize:12, color:"#7A6000" }}>⚠️ Drive未連携のためローカル保存のみ<br/>「Googleと連携」ボタンから連携するとDriveに自動保存されます</div>
                </div>
              )}
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={resetForm} style={{ ...S.btn, background:"#1A1A1A", flex:1 }}>続けて提供する</button>
                <button onClick={()=>setView("mypage")} style={{ ...S.btn, background:"#3D7A5A", flex:1 }}>マイページへ</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 👩‍🏫 教員ダッシュボード
// ══════════════════════════════════════════════════════
function TeacherDashboard({ users, setUsers, photos, upd, del, onLogout, currentUser }) {
  const [tab, setTab]         = useState("review");
  const [filter, setFilter]   = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [comment, setComment] = useState("");
  const [newId, setNewId]     = useState("");
  const [newName, setNewName] = useState("");
  const [newYear, setNewYear] = useState("1");
  const [newPw, setNewPw]     = useState("");
  const [addMsg, setAddMsg]   = useState("");

  const students = users.filter(u=>u.role==="student");
  const counts = { all:photos.length, pending:photos.filter(p=>p.status==="pending").length, approved:photos.filter(p=>p.status==="approved").length, rejected:photos.filter(p=>p.status==="rejected").length };
  const filtered = (filter==="all"?photos:photos.filter(p=>p.status===filter)).filter(p=>userFilter==="all"||p.userId===userFilter);
  const STATUS_COLOR = { pending:"#E8A020", approved:"#3D7A5A", rejected:"#C44" };
  const STATUS_LABEL = { pending:"⏳ 確認待ち", approved:"✅ 承認済み", rejected:"❌ 却下" };

  function act(id, status) { upd(id,status,comment); setSelected(null); setComment(""); }
  function addUser() {
    if(!newId||!newName||!newPw){setAddMsg("❌ 全て入力してください");return;}
    if(users.find(u=>u.id===newId)){setAddMsg("❌ このIDは既に使われています");return;}
    setUsers(prev=>[...prev,{id:newId,name:newName,year:parseInt(newYear),pw:newPw,role:"student",active:true}]);
    setAddMsg(`✅ ${newName}（${newId}）を追加しました`);
    setNewId(""); setNewName(""); setNewPw(""); setNewYear("1");
  }
  function toggleActive(id) { setUsers(prev=>prev.map(u=>u.id===id?{...u,active:!u.active}:u)); }
  function resetPw(id) {
    const tmp="reset"+Math.random().toString(36).slice(2,6);
    setUsers(prev=>prev.map(u=>u.id===id?{...u,pw:tmp}:u));
    alert(`${id} の仮PW: ${tmp}\n本人に伝えてください`);
  }

  return (
    <div style={{ minHeight:"100vh", background:"#F5F5F3", fontFamily:"'Noto Sans JP','Hiragino Sans',sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700;900&display=swap');*{box-sizing:border-box;margin:0;padding:0;}input,textarea,button,select{font-family:inherit;}@keyframes fi{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}.fi{animation:fi 0.3s ease forwards;}`}</style>
      <header style={{ background:"#fff", borderBottom:"1px solid #EBEBEB", padding:"0 16px", height:56, display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:100 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:22 }}>💊</span>
          <div>
            <div style={{ fontSize:13, fontWeight:900 }}>薬学部 写真管理</div>
            <div style={{ fontSize:10, color:"#888" }}>👩‍🏫 {currentUser.name}（管理者）</div>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:12, color:"#E8A020", fontWeight:700 }}>未確認 {counts.pending}件</span>
          <button onClick={onLogout} style={{ fontSize:12, padding:"5px 10px", borderRadius:6, border:"1.5px solid #EEE", background:"#fff", color:"#888", cursor:"pointer" }}>ログアウト</button>
        </div>
      </header>

      <div style={{ background:"#fff", borderBottom:"1px solid #EBEBEB", padding:"0 16px", display:"flex" }}>
        {[["review","📋 写真レビュー"],["users","👤 ユーザー管理"],["stats","📊 活動集計"]].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{ padding:"12px 16px", border:"none", background:"none", cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:700, color:tab===k?"#1A1A1A":"#888", borderBottom:`2px solid ${tab===k?"#1A1A1A":"transparent"}`, marginBottom:-1 }}>{l}</button>
        ))}
      </div>

      {tab==="review" && (
        <div className="fi" style={{ maxWidth:700, margin:"0 auto", padding:"20px 16px 80px" }}>
          <div style={{ display:"flex", gap:6, marginBottom:8, overflowX:"auto" }}>
            {[["all","すべて"],["pending","確認待ち"],["approved","承認済み"],["rejected","却下"]].map(([k,l])=>(
              <button key={k} onClick={()=>setFilter(k)} style={{ padding:"6px 14px", borderRadius:20, whiteSpace:"nowrap", border:`1.5px solid ${filter===k?"#1A1A1A":"#DDD"}`, background:filter===k?"#1A1A1A":"#fff", color:filter===k?"#fff":"#555", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", gap:4 }}>
                {l}<span style={{ background:filter===k?"rgba(255,255,255,.22)":"#F0F0F0", borderRadius:10, padding:"1px 7px", fontSize:11 }}>{counts[k]}</span>
              </button>
            ))}
          </div>
          <div style={{ display:"flex", gap:6, marginBottom:16, overflowX:"auto" }}>
            <button onClick={()=>setUserFilter("all")} style={{ padding:"5px 12px", borderRadius:20, border:`1.5px solid ${userFilter==="all"?"#3D7A5A":"#DDD"}`, background:userFilter==="all"?"#3D7A5A":"#fff", color:userFilter==="all"?"#fff":"#555", fontSize:12, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" }}>全員</button>
            {students.map(s=>(
              <button key={s.id} onClick={()=>setUserFilter(s.id)} style={{ padding:"5px 12px", borderRadius:20, border:`1.5px solid ${userFilter===s.id?"#3D7A5A":"#DDD"}`, background:userFilter===s.id?"#3D7A5A":"#fff", color:userFilter===s.id?"#fff":"#555", fontSize:12, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" }}>{s.name}</button>
            ))}
          </div>

          {filtered.length===0 ? (
            <div style={{ textAlign:"center", padding:"60px 0", color:"#CCC" }}><div style={{ fontSize:40, marginBottom:10 }}>📭</div><div style={{ fontSize:14 }}>該当する写真はありません</div></div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {filtered.map(p=>(
                <div key={p.id} style={{ background:"#fff", borderRadius:14, border:`1.5px solid ${selected?.id===p.id?"#1A1A1A":"#EEE"}`, overflow:"hidden", boxShadow:"0 2px 8px rgba(0,0,0,.05)" }}>
                  <div style={{ display:"flex", gap:12, padding:"14px 14px 0" }}>
                    {p.preview && <img src={p.preview} alt="" style={{ width:72, height:96, objectFit:"cover", borderRadius:8, flexShrink:0 }} />}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <div style={{ background:"#F0F0F0", borderRadius:20, padding:"3px 10px", fontSize:12, fontWeight:700 }}>👤 {p.userName}</div>
                          <div style={{ background:"#E8E8E8", borderRadius:20, padding:"3px 8px", fontSize:11, color:"#666" }}>{p.userId}</div>
                        </div>
                        <span style={{ fontSize:11, padding:"2px 9px", borderRadius:10, background:STATUS_COLOR[p.status]+"22", color:STATUS_COLOR[p.status], fontWeight:700 }}>{STATUS_LABEL[p.status]}</span>
                      </div>
                      <div style={{ fontSize:13, fontWeight:700, marginBottom:2 }}>{p.catEmoji} {p.catLabel}{p.sub&&<span style={{ fontWeight:400, color:"#888" }}> › {p.sub}</span>}</div>
                      <div style={{ fontSize:11, color:"#888", marginBottom:1 }}>🕐 {p.dt?.replace("T"," ")}</div>
                      <div style={{ fontSize:11, color:"#AAA" }}>提出: {p.submittedAt}</div>
                      {p.memo && <div style={{ marginTop:4, fontSize:12, color:"#888", background:"#F7F7F7", borderRadius:6, padding:"4px 8px" }}>💬 {p.memo}</div>}
                      {p.comment && <div style={{ marginTop:4, fontSize:12, color:STATUS_COLOR[p.status], background:STATUS_COLOR[p.status]+"11", borderRadius:6, padding:"4px 8px" }}>📝 {p.comment}</div>}
                    </div>
                  </div>
                  <div style={{ margin:"10px 14px", background:"#F5F5F5", borderRadius:8, padding:"8px 10px" }}>
                    <div style={{ fontSize:10, color:"#888", marginBottom:2 }}>📁 {p.drivePath}</div>
                    <code style={{ fontSize:10, color:"#555", wordBreak:"break-all" }}>{p.fileName}</code>
                    {p.driveLink && <><br/><a href={p.driveLink} target="_blank" rel="noreferrer" style={{ fontSize:11, color:"#3D7A5A", textDecoration:"none", fontWeight:700 }}>📁 Driveで開く →</a></>}
                  </div>
                  <div style={{ padding:"0 14px 14px" }}>
                    {selected?.id===p.id ? (
                      <div>
                        <textarea value={comment} onChange={e=>setComment(e.target.value)} placeholder="コメント（任意）" rows={2} style={{ ...S.input, fontSize:13, marginBottom:8, resize:"none" }} />
                        <div style={{ display:"flex", gap:8 }}>
                          <button onClick={()=>act(p.id,"approved")} style={{ flex:1, ...S.btn, background:"#3D7A5A", padding:"10px" }}>✅ 承認</button>
                          <button onClick={()=>act(p.id,"rejected")} style={{ flex:1, ...S.btn, background:"#C44", padding:"10px" }}>❌ 却下</button>
                          <button onClick={()=>{setSelected(null);setComment("");}} style={{ ...S.btn, background:"#EEE", color:"#555", padding:"10px 14px", width:"auto" }}>×</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display:"flex", gap:8 }}>
                        <button onClick={()=>setSelected(p)} style={{ flex:1, ...S.btn, background:"#1A1A1A", padding:"10px", fontSize:13 }}>審査する</button>
                        <button onClick={()=>del(p.id)} style={{ ...S.btn, background:"#FFF", color:"#CCC", border:"1.5px solid #EEE", padding:"10px 12px", width:"auto", fontSize:16 }}>🗑</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab==="users" && (
        <div className="fi" style={{ maxWidth:600, margin:"0 auto", padding:"20px 16px 80px" }}>
          <div style={{ background:"#fff", borderRadius:14, border:"1.5px solid #EEE", padding:"20px", marginBottom:18 }}>
            <h3 style={{ fontSize:15, fontWeight:800, marginBottom:14 }}>➕ 学生アカウントを追加</h3>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:8 }}>
              <Field label="ユーザーID" req><input value={newId} onChange={e=>setNewId(e.target.value)} placeholder="例：s2024004" style={S.input} /></Field>
              <Field label="学年" req><select value={newYear} onChange={e=>setNewYear(e.target.value)} style={S.input}>{[1,2,3,4,5,6].map(y=><option key={y} value={y}>{y}年生</option>)}</select></Field>
            </div>
            <Field label="氏名" req><input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="例：田中 花子" style={S.input} /></Field>
            <Field label="初期パスワード" req hint="本人に伝えて各自変更してもらいます"><input value={newPw} onChange={e=>setNewPw(e.target.value)} placeholder="6文字以上" style={S.input} /></Field>
            {addMsg && <p style={{ fontSize:12, color:addMsg.includes("✅")?"#3D7A5A":"#C44", marginBottom:8 }}>{addMsg}</p>}
            <button onClick={addUser} style={{ ...S.btn, background:"#1A1A1A" }}>追加する</button>
          </div>
          <h3 style={{ fontSize:14, fontWeight:800, marginBottom:8, paddingLeft:2 }}>登録中の学生</h3>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {students.map(s=>(
              <div key={s.id} style={{ background:"#fff", borderRadius:12, border:"1.5px solid #EEE", padding:"12px 16px", display:"flex", alignItems:"center", gap:12, opacity:s.active?1:0.5 }}>
                <div style={{ width:38, height:38, borderRadius:"50%", background:s.active?"linear-gradient(135deg,#1A4A3A,#3D7A5A)":"#CCC", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:900, fontSize:15, flexShrink:0 }}>{s.name[0]}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:700 }}>{s.name}</div>
                  <div style={{ fontSize:11, color:"#888" }}>{s.id} · {s.year}年生 · {s.active?"✅ 有効":"🚫 停止中"}</div>
                </div>
                <div style={{ fontSize:11, color:"#AAA", marginRight:4 }}>提供: {photos.filter(p=>p.userId===s.id).length}件</div>
                <div style={{ display:"flex", gap:5 }}>
                  <button onClick={()=>resetPw(s.id)} style={{ fontSize:11, padding:"4px 8px", borderRadius:6, border:"1.5px solid #DDD", background:"#fff", color:"#555", cursor:"pointer" }}>PW</button>
                  <button onClick={()=>toggleActive(s.id)} style={{ fontSize:11, padding:"4px 8px", borderRadius:6, border:`1.5px solid ${s.active?"#C44":"#3D7A5A"}`, background:"#fff", color:s.active?"#C44":"#3D7A5A", cursor:"pointer" }}>{s.active?"停止":"有効"}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab==="stats" && (
        <div className="fi" style={{ maxWidth:600, margin:"0 auto", padding:"20px 16px 80px" }}>
          <h3 style={{ fontSize:15, fontWeight:800, marginBottom:4 }}>📊 学生別 活動集計</h3>
          <p style={{ fontSize:12, color:"#888", marginBottom:16 }}>学生活動特別賞の評価資料としてご活用ください</p>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {students.map(s=>{
              const sp=photos.filter(p=>p.userId===s.id);
              const approved=sp.filter(p=>p.status==="approved").length;
              const rate=sp.length>0?Math.round(approved/sp.length*100):0;
              return (
                <div key={s.id} style={{ background:"#fff", borderRadius:14, border:"1.5px solid #EEE", padding:"16px 18px" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                    <div style={{ width:36, height:36, borderRadius:"50%", background:"linear-gradient(135deg,#1A4A3A,#3D7A5A)", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:900, fontSize:14 }}>{s.name[0]}</div>
                    <div><div style={{ fontSize:14, fontWeight:800 }}>{s.name}</div><div style={{ fontSize:11, color:"#888" }}>{s.id} · {s.year}年生</div></div>
                    <div style={{ marginLeft:"auto", textAlign:"right" }}><div style={{ fontSize:20, fontWeight:900, color:"#3D7A5A" }}>{sp.length}</div><div style={{ fontSize:10, color:"#888" }}>提供数</div></div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:6 }}>
                    {[["承認",approved,"#3D7A5A"],["確認待ち",sp.filter(p=>p.status==="pending").length,"#E8A020"],["却下",sp.filter(p=>p.status==="rejected").length,"#C44"],["承認率",`${rate}%`,"#1A1A1A"]].map(([l,v,c])=>(
                      <div key={l} style={{ background:"#F7F7F7", borderRadius:8, padding:"8px 0", textAlign:"center" }}>
                        <div style={{ fontSize:16, fontWeight:800, color:c }}>{v}</div>
                        <div style={{ fontSize:10, color:"#888" }}>{l}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 🚀 メインアプリ
// ══════════════════════════════════════════════════════
export default function App() {
  const [users, setUsers]   = useState(INITIAL_USERS);
  const [photos, setPhotos] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);

  const upd = (id,status,comment="") => setPhotos(prev=>prev.map(p=>p.id===id?{...p,status,comment}:p));
  const del = id => setPhotos(prev=>prev.filter(p=>p.id!==id));

  if (!currentUser) return <LoginScreen users={users} onLogin={setCurrentUser} />;

  if (currentUser.role==="teacher") {
    return <TeacherDashboard users={users} setUsers={setUsers} photos={photos} upd={upd} del={del} currentUser={currentUser} onLogout={()=>setCurrentUser(null)} />;
  }

  return <SubmitForm user={currentUser} photos={photos} onSubmit={p=>setPhotos(prev=>[p,...prev])} onLogout={()=>setCurrentUser(null)} />;
}
