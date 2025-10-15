import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, RecaptchaVerifier, onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPhoneNumber, updatePassword, PhoneAuthProvider, signInWithCredential } from 'firebase/auth';
import { 
    getFirestore, doc, getDoc, setDoc, onSnapshot, 
    collection, deleteDoc, updateDoc, writeBatch, runTransaction, query, addDoc, where, getDocs, serverTimestamp
} from 'firebase/firestore';

// ===================================================================================
// Firebase 설정 (콕스타 - noerror-14ce3 프로젝트)
// ===================================================================================
const firebaseConfig = {
  apiKey: "AIzaSyC-eeHazZ3kVj7aQicdtlnhEmLbbTJHgGE",
  authDomain: "noerror-14ce3.firebaseapp.com",
  projectId: "noerror-14ce3",
  storageBucket: "noerror-14ce3.appspot.com",
  messagingSenderId: "279065154821",
  appId: "1:279065154821:web:812570dde2bdde560a936c",
  measurementId: "G-PFGZGHT9T4"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ===================================================================================
// 상수 및 Helper 함수
// ===================================================================================
const SUPER_ADMIN_NAMES = ["나채빈", "정형진", "윤지혜", "이상민", "이정문", "신영은", "오미리"];
const PLAYERS_PER_MATCH = 4;
const LEVEL_ORDER = { 'A조': 1, 'B조': 2, 'C조': 3, 'D조': 4, 'N조': 5 };
const TEST_PHONE_NUMBER = "01012345678";

const getLevelColor = (level) => {
    switch (level) {
        case 'A조': return '#FF4F4F';
        case 'B조': return '#FF9100';
        case 'C조': return '#FFD600';
        case 'D조': return '#00E676';
        default: return '#A1A1AA';
    }
};

// ===================================================================================
// 공용 UI 컴포넌트 (모달, 카드 등)
// ===================================================================================

const PlayerCard = React.memo(({ player, context, isAdmin, onCardClick, onAction, onLongPress, isCurrentUser, isPlaying = false, isSelected = false, onDragStart, onDragEnd, onDragOver, onDrop }) => {
    const longPressTimer = useRef(null);
    const handleMouseDown = (e) => { if(isAdmin) { e.preventDefault(); longPressTimer.current = setTimeout(() => onLongPress(player), 1000); }};
    const handleMouseUp = () => clearTimeout(longPressTimer.current);
    const handleTouchStart = (e) => { if(isAdmin) { e.preventDefault(); longPressTimer.current = setTimeout(() => onLongPress(player), 1000); }};
    const handleTouchEnd = () => clearTimeout(longPressTimer.current);

    const genderStyle = { boxShadow: `inset 4px 0 0 0 ${player.gender === '남' ? '#3B82F6' : '#EC4899'}` };
    const adminIcon = (SUPER_ADMIN_NAMES.includes(player.name) || context.isAdmin) ? '👑' : '';
    const levelColor = getLevelColor(player.level);
    const levelStyle = { color: levelColor, fontWeight: 'bold', fontSize: '14px', textShadow: `0 0 5px ${levelColor}` };

    const cardStyle = {
        ...genderStyle,
        border: '2px solid transparent',
        transition: 'all 0.2s ease-in-out',
        backgroundColor: '#2d3748',
        opacity: isPlaying || player.isResting ? 0.6 : 1,
        filter: player.isResting ? 'grayscale(80%)' : 'none',
    };

    if (isSelected) {
        cardStyle.borderColor = '#34d399';
        cardStyle.transform = 'scale(1.05)';
        cardStyle.boxShadow = `0 0 15px 5px rgba(52, 211, 153, 0.9)`;
    }
    if (isCurrentUser) {
        cardStyle.borderColor = '#FBBF24';
        cardStyle.boxShadow = `${cardStyle.boxShadow || ''}, 0 0 12px 4px rgba(251, 191, 36, 0.9)`;
    }
    
    return (
        <div 
            className="player-card p-1 rounded-md relative flex flex-col justify-center text-center h-14 w-full cursor-pointer"
            style={cardStyle}
            onClick={isAdmin && onCardClick ? () => onCardClick(player) : null}
            onMouseDown={handleMouseDown} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} onTouchCancel={handleTouchEnd}
            draggable={isAdmin} onDragStart={(e) => onDragStart(e, player.id)} onDragEnd={onDragEnd}
            onDragOver={onDragOver} onDrop={(e) => onDrop(e, {type: 'player', id: player.id})}
        >
            <div>
                <div className="player-name text-white text-xs font-bold whitespace-nowrap leading-tight tracking-tighter">{adminIcon}{player.name}</div>
                <div className="player-info text-gray-400 text-[10px] leading-tight mt-px whitespace-nowrap">
                    <span style={levelStyle}>{(player.level || '').replace('조','')}</span >|
                    {`${player.todayGames || 0}게임`}
                </div>
            </div>
            {isAdmin && onAction && context.location !== 'court' && (
                <button onClick={(e) => { e.stopPropagation(); onAction(player); }} className="absolute -top-2 -right-2 p-1 text-gray-500 hover:text-yellow-400">
                    <i className="fas fa-times-circle fa-xs"></i>
                </button>
            )}
        </div>
    );
});

const EmptySlot = ({ onSlotClick, onDragOver, onDrop }) => ( 
    <div onClick={onSlotClick} onDragOver={onDragOver} onDrop={onDrop}
        className="player-slot h-14 bg-black/30 rounded-md flex items-center justify-center text-gray-600 border-2 border-dashed border-gray-700 cursor-pointer hover:bg-gray-700/50 hover:border-yellow-400 transition-all">
        <span className="text-xl font-bold">+</span>
    </div> 
);

const CourtTimer = ({ court }) => {
    const [time, setTime] = useState('00:00');
    useEffect(() => {
        if (court && court.startTime) {
            const timerId = setInterval(() => {
                const now = new Date();
                const startTime = court.startTime.toDate();
                const diff = Math.floor((now - startTime) / 1000);
                const minutes = String(Math.floor(diff / 60)).padStart(2, '0');
                const seconds = String(diff % 60).padStart(2, '0');
                setTime(`${minutes}:${seconds}`);
            }, 1000);
            return () => clearInterval(timerId);
        } else { setTime('00:00'); }
    }, [court]);
    return <div className="text-center text-xs font-mono text-white mt-1 tracking-wider">{time}</div>;
};

function AlertModal({ title, body, onClose }) { return ( <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"><div className="bg-gray-800 rounded-lg p-6 w-full max-w-sm text-center shadow-lg"><h3 className="text-xl font-bold text-yellow-400 mb-4">{title}</h3><p className="text-gray-300 mb-6 whitespace-pre-line">{body}</p><button onClick={onClose} className="w-full arcade-button bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-2 rounded-lg transition-colors">확인</button></div></div> ); }
function ConfirmationModal({ title, body, onConfirm, onCancel }) { return ( <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"><div className="bg-gray-800 rounded-lg p-6 w-full max-w-sm text-center shadow-lg"><h3 className="text-xl font-bold text-white mb-4">{title}</h3><p className="text-gray-300 mb-6">{body}</p><div className="flex gap-4"><button onClick={onCancel} className="w-full arcade-button bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 rounded-lg transition-colors">취소</button><button onClick={onConfirm} className="w-full arcade-button bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-lg transition-colors">확인</button></div></div></div>); }
function CourtSelectionModal({ courts, onSelect, onCancel }) {
    const [isProcessing, setIsProcessing] = useState(false);
    return ( 
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-sm text-center shadow-lg">
                <h3 className="text-xl font-bold text-yellow-400 mb-4 arcade-font">코트 선택</h3>
                <p className="text-gray-300 mb-6">경기를 시작할 코트를 선택해주세요.</p>
                <div className="flex flex-col gap-3">
                    {courts.map(courtIdx => ( 
                        <button key={courtIdx} onClick={() => { setIsProcessing(true); onSelect(courtIdx); }} disabled={isProcessing} className="w-full arcade-button bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-2 rounded-lg transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed">
                            {isProcessing ? '처리 중...' : `${courtIdx + 1}번 코트`}
                        </button> 
                    ))}
                </div>
                <button onClick={onCancel} disabled={isProcessing} className="mt-6 w-full arcade-button bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 rounded-lg transition-colors">취소</button>
            </div>
        </div> 
    ); 
}
function ResultInputModal({ courtIndex, players, onResultSubmit, onClose }) {
    const [winners, setWinners] = useState([]);
    const handlePlayerClick = (playerId) => setWinners(prev => prev.includes(playerId) ? prev.filter(id => id !== playerId) : (prev.length < 2 ? [...prev, playerId] : prev));
    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md text-center shadow-lg">
                <h3 className="text-xl font-bold text-yellow-400 mb-4 arcade-font flicker-text">승리팀 선택</h3>
                <p className="text-gray-300 mb-6">승리한 선수 2명을 선택하세요.</p>
                <div className="grid grid-cols-4 gap-2">
                    {players.map(p => ( <PlayerCard key={p.id} player={p} context={{}} isAdmin={true} onCardClick={() => handlePlayerClick(p.id)} isSelected={winners.includes(p.id)} /> ))}
                </div>
                <div className="flex gap-4 mt-6">
                    <button onClick={onClose} className="w-full arcade-button bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 rounded-lg">취소</button>
                    <button onClick={() => onResultSubmit(courtIndex, winners)} disabled={winners.length !== 2} className="w-full arcade-button bg-green-500 hover:bg-green-600 text-black font-bold py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">결과 확정</button>
                </div>
            </div>
        </div>
    );
}

function SettingsModal({ roomData, onSave, onCancel, onSystemReset }) {
    const [settings, setSettings] = useState({
        numScheduledMatches: roomData.numScheduledMatches,
        numInProgressCourts: roomData.numInProgressCourts,
    });
    const handleChange = (field, value) => setSettings(s => ({...s, [field]: Math.max(1, (s[field] || 0) + value)}));
    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-lg text-white shadow-lg flex flex-col">
                <h3 className="text-xl font-bold text-white mb-6 arcade-font text-center flex-shrink-0">방 설정</h3>
                <div className="flex-grow overflow-y-auto pr-2 space-y-4">
                    <div className="bg-gray-700 p-3 rounded-lg">
                        <span className="font-semibold mb-2 block text-center">경기 예정 / 코트 수</span>
                        <div className="flex items-center justify-around">
                            <div className="text-center"><p>예정</p><div className="flex items-center gap-2 mt-1"><button onClick={() => handleChange('numScheduledMatches', -1)} className="w-8 h-8 bg-gray-600 rounded-full text-lg">-</button><span className="text-xl font-bold w-8 text-center">{settings.numScheduledMatches}</span><button onClick={() => handleChange('numScheduledMatches', 1)} className="w-8 h-8 bg-gray-600 rounded-full text-lg">+</button></div></div>
                            <div className="text-center"><p>코트</p><div className="flex items-center gap-2 mt-1"><button onClick={() => handleChange('numInProgressCourts', -1)} className="w-8 h-8 bg-gray-600 rounded-full text-lg">-</button><span className="text-xl font-bold w-8 text-center">{settings.numInProgressCourts}</span><button onClick={() => handleChange('numInProgressCourts', 1)} className="w-8 h-8 bg-gray-600 rounded-full text-lg">+</button></div></div>
                        </div>
                    </div>
                    <div className="bg-gray-700 p-3 rounded-lg space-y-2"><label className="font-semibold mb-2 block text-center">고급 기능</label><button onClick={onSystemReset} className="w-full arcade-button bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-lg">시스템 초기화</button></div>
                </div>
                <div className="mt-6 flex gap-4 flex-shrink-0"><button onClick={onCancel} className="w-full arcade-button bg-gray-600 hover:bg-gray-700 font-bold py-2 rounded-lg">취소</button><button onClick={() => onSave(settings)} className="w-full arcade-button bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-2 rounded-lg">저장</button></div>
            </div>
        </div>
    );
}

function EditGamesModal({ player, onSave, onClose }) {
    const [games, setGames] = useState(player.todayGames || 0);
    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-sm text-center shadow-lg">
                <h3 className="text-xl font-bold text-yellow-400 mb-4">{player.name} 경기 수 조작</h3>
                <div className="flex items-center justify-center gap-4 my-6">
                    <button onClick={() => setGames(g => Math.max(0, g - 1))} className="w-12 h-12 bg-gray-600 rounded-full text-2xl arcade-button">-</button>
                    <span className="text-4xl font-bold w-16 text-center arcade-font">{games}</span>
                    <button onClick={() => setGames(g => g + 1)} className="w-12 h-12 bg-gray-600 rounded-full text-2xl arcade-button">+</button>
                </div>
                <div className="flex gap-4">
                    <button onClick={onClose} className="w-full arcade-button bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 rounded-lg">취소</button>
                    <button onClick={() => onSave(player.id, games)} className="w-full arcade-button bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-2 rounded-lg">저장</button>
                </div>
            </div>
        </div>
    );
}

// ===================================================================================
// 페이지 컴포넌트
// ===================================================================================

function AuthPage({ setPage }) {
    const [mode, setMode] = useState('login');
    const [error, setError] = useState('');
    
    useEffect(() => {
        const recaptchaContainer = document.getElementById('recaptcha-container');
        if (recaptchaContainer && !window.recaptchaVerifier) {
            try {
                window.recaptchaVerifier = new RecaptchaVerifier(auth, recaptchaContainer, { 'size': 'invisible' });
            } catch (e) {
                console.error("Recaptcha Verifier error on mount:", e);
                setError("reCAPTCHA 초기화에 실패했습니다. 페이지를 새로고침 해주세요.");
            }
        }
    }, []);
    
    const ensureRecaptcha = () => {
        if (!window.recaptchaVerifier) {
            const recaptchaContainer = document.getElementById('recaptcha-container');
            if(recaptchaContainer){
                window.recaptchaVerifier = new RecaptchaVerifier(auth, recaptchaContainer, { 'size': 'invisible' });
            }
        }
        return window.recaptchaVerifier;
    }

    const renderForm = () => {
        switch (mode) {
            case 'signup': return <SignUpForm setError={setError} setMode={setMode} ensureRecaptcha={ensureRecaptcha} />;
            case 'findAccount': return <FindAccountForm setError={setError} setMode={setMode} ensureRecaptcha={ensureRecaptcha} />;
            default: return <LoginForm setError={setError} setMode={setMode} />;
        }
    };
    
    return (
        <div className="bg-black text-white min-h-screen flex items-center justify-center font-sans p-4">
            <div id="recaptcha-container"></div>
            <div className="bg-gray-800 p-8 rounded-lg shadow-lg w-full max-w-sm">
                <h1 className="text-3xl font-bold text-yellow-400 mb-6 text-center arcade-font flicker-text">콕스타</h1>
                {error && <p className="text-red-500 text-center mb-4 text-sm">{error}</p>}
                {renderForm()}
            </div>
        </div>
    );
}

function LoginForm({ setError, setMode }) {
    const [formData, setFormData] = useState({ username: '', password: ''});
    const handleChange = e => setFormData({ ...formData, [e.target.name]: e.target.value });
    const handleLogin = async (e) => {
        e.preventDefault(); setError('');
        const email = formData.username === 'domain' ? 'domain@special.user' : `${formData.username}@cockstar.app`;
        try {
            await signInWithEmailAndPassword(auth, email, formData.password);
        } catch (err) { setError('아이디 또는 비밀번호가 잘못되었습니다.'); }
    };
    return (
        <form onSubmit={handleLogin} className="space-y-4">
            <h2 className="text-xl font-bold text-center">로그인</h2>
            <input type="text" name="username" placeholder="아이디" onChange={handleChange} required className="w-full bg-gray-700 text-white p-3 rounded-lg" />
            <input type="password" name="password" placeholder="비밀번호" onChange={handleChange} required className="w-full bg-gray-700 text-white p-3 rounded-lg" />
            <button type="submit" className="w-full arcade-button bg-yellow-500 text-black font-bold py-3 rounded-lg">로그인</button>
            <div className="text-center text-sm text-gray-400 mt-2">
                <button type="button" onClick={() => setMode('signup')} className="hover:text-white">회원가입</button> | <button type="button" onClick={() => setMode('findAccount')} className="hover:text-white">ID/PW 찾기</button>
            </div>
        </form>
    );
}

function SignUpForm({ setError, setMode, ensureRecaptcha }) {
    const [formData, setFormData] = useState({ name: '', username: '', password: '', confirmPassword: '', level: 'A조', gender: '남', birthYear: '2000', phone: '' });
    const [step, setStep] = useState(1);
    const [verificationId, setVerificationId] = useState('');
    const [verificationCode, setVerificationCode] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [usernameStatus, setUsernameStatus] = useState({ status: 'idle', message: '' });
    const [passwordError, setPasswordError] = useState('');

    const handleChange = e => {
        const { name, value } = e.target;
        setFormData({ ...formData, [name]: value });
        if (name === 'username') setUsernameStatus({ status: 'idle', message: '' });
        if (name === 'confirmPassword' && formData.password !== value) setPasswordError('비밀번호가 일치하지 않습니다.');
        else if (name === 'confirmPassword') setPasswordError('');
    };

    const handleCheckUsername = async () => {
        if (!formData.username) { setUsernameStatus({ status: 'invalid', message: '아이디를 입력해주세요.' }); return; }
        if (formData.username === 'domain') { setUsernameStatus({ status: 'invalid', message: "'domain'은 사용할 수 없는 아이디입니다."}); return; }
        setUsernameStatus({ status: 'checking', message: '확인 중...' });
        const q = query(collection(db, "users"), where("username", "==", formData.username));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) { setUsernameStatus({ status: 'invalid', message: '이미 사용중인 아이디입니다.' }); } 
        else { setUsernameStatus({ status: 'valid', message: '사용 가능한 아이디입니다.' }); }
    };
    
    const handleNextStep = (e) => {
        e.preventDefault();
        setError(''); setPasswordError('');
        if (formData.password.length < 6) { setPasswordError('비밀번호는 6자 이상이어야 합니다.'); return; }
        if (formData.password !== formData.confirmPassword) { setPasswordError('비밀번호가 일치하지 않습니다.'); return; }
        if (usernameStatus.status !== 'valid') { setError('아이디 중복 확인을 통과해야 합니다.'); return; }
        setStep(2);
    };

    const handlePhoneSubmit = async () => {
        setError('');
        try {
            const sanitizedPhone = formData.phone.replace(/[^0-9]/g, "");
            if (!sanitizedPhone.startsWith("01") || sanitizedPhone.length < 10) { setError("올바른 휴대폰 번호 형식(010...)으로 입력해주세요."); return; }
            if (sanitizedPhone !== TEST_PHONE_NUMBER.replace(/[^0-9]/g, "")) {
                const q = query(collection(db, "users"), where("phone", "==", formData.phone));
                if (!(await getDocs(q)).empty) { setError('이미 가입된 전화번호입니다.'); return; }
            }
            const phoneNumber = `+82${sanitizedPhone.substring(1)}`;
            const verifier = ensureRecaptcha();
            const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, verifier);
            setVerificationId(confirmationResult.verificationId);
            alert('인증번호가 발송되었습니다.');
        } catch (err) { setError(`인증번호 발송 실패: ${err.message}`); console.error(err) }
    };

    const handleSignUp = async () => {
        setError('');
        try {
            if (!verificationId || !verificationCode) { setError('인증번호를 입력해주세요.'); return; }
            const userCredential = await createUserWithEmailAndPassword(auth, `${formData.username}@cockstar.app`, formData.password);
            await setDoc(doc(db, "users", userCredential.user.uid), {
                name: formData.name, username: formData.username, level: formData.level, gender: formData.gender, birthYear: formData.birthYear, phone: formData.phone,
            });
            alert(`가입 완료! 이제 로그인해주세요.`);
            setMode('login');
        } catch (err) { setError(`가입 실패: ${err.message}`); }
    };
    
    const birthYears = Array.from({length: 70}, (_, i) => new Date().getFullYear() - i - 15);

    const checkBtnClass = {
        idle: 'bg-gray-600',
        checking: 'bg-yellow-600',
        valid: 'bg-green-600',
        invalid: 'bg-red-600',
    }[usernameStatus.status];

    if (step === 2) {
        return (
            <div className="space-y-4">
                <h2 className="text-xl font-bold text-center">전화번호 인증</h2>
                <div className="flex gap-2">
                    <input type="tel" name="phone" placeholder="전화번호 ('-' 제외)" value={formData.phone} onChange={handleChange} required className="w-full bg-gray-700 text-white p-3 rounded-lg" />
                    <button type="button" onClick={handlePhoneSubmit} className="arcade-button bg-gray-600 text-white font-bold px-3 text-sm">인증</button>
                </div>
                <input type="text" placeholder="인증번호" value={verificationCode} onChange={(e) => setVerificationCode(e.target.value)} required className="w-full bg-gray-700 text-white p-3 rounded-lg" />
                <button onClick={handleSignUp} className="w-full arcade-button bg-yellow-500 text-black font-bold py-3 rounded-lg">가입 완료하기</button>
                <button type="button" onClick={() => setStep(1)} className="w-full text-center text-sm text-gray-400 mt-2">이전 단계로</button>
            </div>
        );
    }

    return (
        <form onSubmit={handleNextStep} className="space-y-3">
            <h2 className="text-xl font-bold text-center">회원가입</h2>
            <input type="text" name="name" placeholder="이름" onChange={handleChange} required className="w-full bg-gray-700 p-3 rounded-lg"/>
            <div>
                <div className="flex gap-2">
                    <input type="text" name="username" placeholder="아이디" value={formData.username} onChange={handleChange} required className="w-full bg-gray-700 p-3 rounded-lg"/>
                    <button type="button" onClick={handleCheckUsername} className={`arcade-button text-white font-bold px-3 text-xs whitespace-nowrap ${checkBtnClass}`}>중복확인</button>
                </div>
                {usernameStatus.message && <p className={`text-xs mt-1 px-1 ${usernameStatus.status === 'valid' ? 'text-green-400' : 'text-red-400'}`}>{usernameStatus.message}</p>}
            </div>
             <input type={showPassword ? "text" : "password"} name="password" placeholder="비밀번호 (6자 이상)" onChange={handleChange} required className="w-full bg-gray-700 p-3 rounded-lg"/>
             <div>
                <input type={showPassword ? "text" : "password"} name="confirmPassword" placeholder="비밀번호 확인" onChange={handleChange} required className="w-full bg-gray-700 p-3 rounded-lg"/>
                {passwordError && <p className="text-xs mt-1 px-1 text-red-400">{passwordError}</p>}
             </div>
            <label className="text-xs flex items-center gap-2"><input type="checkbox" checked={showPassword} onChange={() => setShowPassword(!showPassword)} /> 비밀번호 표시</label>
            <div className="grid grid-cols-2 gap-2">
                <select name="level" onChange={handleChange} className="bg-gray-700 p-3 rounded-lg"><option>A조</option><option>B조</option><option>C조</option><option>D조</option></select>
                <select name="gender" onChange={handleChange} className="bg-gray-700 p-3 rounded-lg"><option>남</option><option>여</option></select>
            </div>
            <div>
                <label className="text-xs text-gray-400 px-1">출생년도</label>
                <select name="birthYear" onChange={handleChange} defaultValue="2000" className="w-full bg-gray-700 p-3 rounded-lg">
                    {birthYears.map(year => <option key={year} value={year}>{year}</option>)}
                </select>
            </div>
            <button type="submit" className="w-full arcade-button bg-yellow-500 text-black font-bold py-3 rounded-lg">다음</button>
            <button type="button" onClick={() => setMode('login')} className="w-full text-center text-sm text-gray-400 mt-2">로그인 화면으로</button>
        </form>
    );
}

function FindAccountForm({ setError, setMode, ensureRecaptcha }) {
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState({ name: '', phone: '' });
    const [foundUser, setFoundUser] = useState(null);
    const [confirmationResult, setConfirmationResult] = useState(null);
    const [verificationCode, setVerificationCode] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const handleChange = e => setFormData({ ...formData, [e.target.name]: e.target.value });

    const handleFindId = async () => {
        setError('');
        if (!formData.name || !formData.phone) { setError("이름과 전화번호를 모두 입력해주세요."); return; }
        const q = query(collection(db, "users"), where("name", "==", formData.name), where("phone", "==", formData.phone));
        const snapshot = await getDocs(q);
        if (snapshot.empty) { setError("일치하는 사용자가 없습니다."); setFoundUser(null); }
        else { 
            const user = {id: snapshot.docs[0].id, ...snapshot.docs[0].data()};
            setFoundUser(user);
            setError(`아이디는 [ ${user.username} ] 입니다.`);
        }
    };
    
    const handleSendCode = async () => {
        setError('');
        if (!foundUser) { setError("먼저 아이디를 찾아주세요."); return; }
        try {
            const phoneNumber = `+82${foundUser.phone.substring(1)}`;
            const verifier = ensureRecaptcha();
            const result = await signInWithPhoneNumber(auth, phoneNumber, verifier);
            setConfirmationResult(result);
            setStep(2);
            alert("인증번호가 발송되었습니다.");
        } catch(err) { setError(`인증번호 발송에 실패했습니다: ${err.message}`); }
    };

    const handleVerifyCode = async () => {
        setError('');
        if (!verificationCode) { setError("인증번호를 입력해주세요."); return; }
        try {
            await confirmationResult.confirm(verificationCode);
            setStep(3);
        } catch (err) { setError("인증번호가 잘못되었습니다."); }
    };
    
    const handleResetPassword = async () => {
        setError('');
        if (newPassword.length < 6) { setError("비밀번호는 6자 이상이어야 합니다."); return; }
        if (newPassword !== confirmPassword) { setError("비밀번호가 일치하지 않습니다."); return; }
        try {
            if(auth.currentUser) {
                await updatePassword(auth.currentUser, newPassword);
                alert("비밀번호가 성공적으로 변경되었습니다. 다시 로그인해주세요.");
                await signOut(auth);
                setMode('login');
            } else {
                setError("인증 세션이 만료되었습니다. 처음부터 다시 시도해주세요.");
                setStep(1);
            }
        } catch (err) { setError(`비밀번호 변경에 실패했습니다. 다시 시도해주세요: ${err.message}`); }
    };

    if (step === 3) {
        return (<div className="space-y-4">
            <h2 className="text-xl font-bold text-center">비밀번호 재설정</h2>
            <input type={showPassword ? "text" : "password"} placeholder="새 비밀번호 (6자 이상)" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full bg-gray-700 p-3 rounded-lg" />
            <input type={showPassword ? "text" : "password"} placeholder="새 비밀번호 확인" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full bg-gray-700 p-3 rounded-lg" />
            <label className="text-xs flex items-center gap-2"><input type="checkbox" checked={showPassword} onChange={() => setShowPassword(!showPassword)} /> 비밀번호 표시</label>
            <button onClick={handleResetPassword} className="w-full arcade-button bg-yellow-500 text-black font-bold py-3 rounded-lg">변경하기</button>
            <button type="button" onClick={() => { setStep(1); setError(''); }} className="w-full text-center text-sm text-gray-400 mt-2">처음으로</button>
        </div>);
    }

    if (step === 2) {
        return (<div className="space-y-4">
            <h2 className="text-xl font-bold text-center">인증번호 입력</h2>
            <input type="text" placeholder="인증번호" value={verificationCode} onChange={e => setVerificationCode(e.target.value)} className="w-full bg-gray-700 p-3 rounded-lg" />
            <button onClick={handleVerifyCode} className="w-full arcade-button bg-yellow-500 text-black font-bold py-3 rounded-lg">확인</button>
            <button type="button" onClick={() => { setStep(1); setError(''); }} className="w-full text-center text-sm text-gray-400 mt-2">이전으로</button>
        </div>);
    }
    
    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold text-center">ID/PW 찾기</h2>
            <input type="text" name="name" placeholder="이름" onChange={handleChange} className="w-full bg-gray-700 p-3 rounded-lg" />
            <input type="tel" name="phone" placeholder="전화번호" onChange={handleChange} className="w-full bg-gray-700 p-3 rounded-lg" />
            <button onClick={handleFindId} className="w-full arcade-button bg-gray-600 text-white font-bold py-2 rounded-lg">아이디 찾기</button>
            {foundUser && <button onClick={handleSendCode} className="w-full arcade-button bg-yellow-500 text-black font-bold py-2 rounded-lg">비밀번호 재설정</button>}
            <button type="button" onClick={() => setMode('login')} className="w-full text-center text-sm text-gray-400 mt-2">로그인 화면으로</button>
        </div>
    );
}


function LobbyPage({ userData, setPage, setRoomId }) {
    const [rooms, setRooms] = useState([]);
    const [filteredRooms, setFilteredRooms] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [modal, setModal] = useState({ type: null, data: null });

    useEffect(() => {
        const unsubscribe = onSnapshot(query(collection(db, "rooms")), (snapshot) => {
            const roomsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setRooms(roomsData);
            setFilteredRooms(roomsData);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        setFilteredRooms(rooms.filter(room => room.name.toLowerCase().includes(searchTerm.toLowerCase())));
    }, [searchTerm, rooms]);

    const handleCreateOrUpdateRoom = async (roomData) => {
        try {
            if (modal.data?.id) { // Update
                const roomRef = doc(db, 'rooms', modal.data.id);
                await updateDoc(roomRef, roomData);
            } else { // Create
                const roomRef = await addDoc(collection(db, "rooms"), { ...roomData, createdAt: serverTimestamp(), createdBy: userData.uid });
                handleEnterRoom(roomRef.id);
            }
            setModal({type: null, data: null});
        } catch (e) {
            console.error(e);
            alert("작업에 실패했습니다.");
        }
    };

    const handleDeleteRoom = async (roomId) => {
        if (!roomId) return;
        if(confirm("정말로 이 방을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) {
            await deleteDoc(doc(db, 'rooms', roomId));
            setModal({type: null, data: null});
        }
    };
    
    const handleEnterRoomClick = (room) => {
        if (room.password) {
            const enteredPassword = prompt("비밀번호를 입력하세요:");
            if (enteredPassword === room.password) {
                handleEnterRoom(room.id);
            } else if (enteredPassword !== null) {
                alert("비밀번호가 틀렸습니다.");
            }
        } else {
            handleEnterRoom(room.id);
        }
    };
    
    const handleCreateRoomClick = () => {
        if (userData.username === 'domain') {
            setModal({type: 'room', data: {}});
        } else {
            setModal({type: 'alert', data: {
                title: "방 만들기 안내",
                body: "방 만들기를 원할 경우 아래 연락처로 연락주세요!\n010-2245-9369 정형진"
            }});
        }
    };

    const handleEnterRoom = async (roomId) => {
        const playerDocRef = doc(db, 'rooms', roomId, 'players', userData.uid);
        await setDoc(playerDocRef, { ...userData, todayGames: 0, isResting: false, entryTime: new Date().toISOString() });
        setRoomId(roomId);
        setPage('room');
    };

    const canEdit = (room) => userData.username === 'domain' || (room.admins || []).includes(userData.username);
    
    return (
         <div className="bg-black text-white min-h-screen flex flex-col items-center p-4">
            {modal.type === 'room' && <RoomModal data={modal.data} onSave={handleCreateOrUpdateRoom} onClose={() => setModal({type:null})} onDelete={handleDeleteRoom} isSuperAdmin={userData.username === 'domain'} />}
            {modal.type === 'alert' && <AlertModal {...modal.data} onClose={() => setModal({type:null})} />}
            <header className="w-full max-w-2xl flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold arcade-font flicker-text text-yellow-400">로비</h1>
                <div>
                    <button onClick={() => setPage('profile')} className="mr-4 cursor-pointer text-lg">👤 {userData.name}님</button>
                    <button onClick={() => signOut(auth)} className="arcade-button bg-red-600 text-white py-1 px-3 text-sm rounded-md">로그아웃</button>
                </div>
            </header>
            <div className="w-full max-w-2xl bg-gray-800 p-4 rounded-lg">
                <div className="flex gap-2 mb-4">
                    <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="방 이름 검색..." className="flex-grow bg-gray-700 p-2 rounded-lg" />
                    <button onClick={handleCreateRoomClick} className="arcade-button bg-yellow-500 text-black font-bold px-4 rounded-lg">방 만들기</button>
                </div>
                <div className="space-y-2">
                    {filteredRooms.map(room => (
                        <div key={room.id} className="flex justify-between items-center bg-gray-700 p-3 rounded-lg">
                            <button className="flex-grow text-left" onClick={() => canEdit(room) && setModal({type: 'room', data: room})}>
                                <span className="font-semibold">{room.name}</span>
                                {room.password && <span className="ml-2 text-gray-400">🔒</span>}
                            </button>
                            <button onClick={() => handleEnterRoomClick(room)} className="arcade-button bg-green-500 text-black font-bold px-4 py-1 text-sm rounded-lg">입장</button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function RoomModal({ data, onSave, onClose, onDelete, isSuperAdmin }) {
    const [roomData, setRoomData] = useState({ name: '', password: '', admins: [''], usePassword: false, ...data });
    const [showPassword, setShowPassword] = useState(false);
    useEffect(() => setRoomData({name: '', password: '', admins: [''], usePassword: false, ...data }), [data]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setRoomData(d => ({...d, [name]: type === 'checkbox' ? checked : value }));
    };

    const handleAdminChange = (index, value) => {
        const newAdmins = [...roomData.admins];
        newAdmins[index] = value;
        setRoomData(d => ({ ...d, admins: newAdmins }));
    };
    const addAdminInput = () => setRoomData(d => ({ ...d, admins: [...d.admins, ''] }));

    const handleSave = () => {
        const finalData = {
            name: roomData.name,
            admins: roomData.admins.map(a => a.trim()).filter(Boolean),
            password: roomData.usePassword ? roomData.password : ''
        };
        onSave(finalData);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md text-white shadow-lg space-y-4">
                <h3 className="text-xl font-bold text-yellow-400 arcade-font">{data.id ? "방 수정" : "방 만들기"}</h3>
                <input type="text" name="name" placeholder="방 이름" value={roomData.name} onChange={handleChange} className="w-full bg-gray-700 p-2 rounded-lg" />
                <label className="flex items-center gap-2"><input type="checkbox" name="usePassword" checked={roomData.usePassword} onChange={handleChange} /> 비밀번호 사용</label>
                {roomData.usePassword && <div>
                    <input type={showPassword ? "text" : "password"} name="password" placeholder="비밀번호" value={roomData.password} onChange={handleChange} className="w-full bg-gray-700 p-2 rounded-lg" />
                    <label className="text-xs flex items-center gap-2 mt-1"><input type="checkbox" checked={showPassword} onChange={() => setShowPassword(!showPassword)} /> 비밀번호 표시</label>
                </div>}
                <div>
                    <label className="block mb-2">관리자 아이디</label>
                    {roomData.admins.map((admin, index) => (
                        <input key={index} type="text" value={admin} onChange={(e) => handleAdminChange(index, e.target.value)} className="w-full bg-gray-700 p-2 rounded-lg mb-2" />
                    ))}
                    <button onClick={addAdminInput} className="text-sm text-yellow-400">+ 관리자 추가</button>
                </div>
                <div className="flex gap-4 mt-4">
                    <button onClick={onClose} className="w-full arcade-button bg-gray-600">취소</button>
                    <button onClick={handleSave} className="w-full arcade-button bg-yellow-500 text-black">저장</button>
                </div>
                {data.id && isSuperAdmin && <button onClick={() => onDelete(data.id)} className="w-full arcade-button bg-red-800 mt-2">방 삭제</button>}
            </div>
        </div>
    );
}


function ProfilePage({ userData, setPage }) {
    const [profileData, setProfileData] = useState({ name: userData.name, level: userData.level, gender: userData.gender, birthYear: userData.birthYear, newPassword: '', confirmPassword: '' });
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const handleChange = (e) => setProfileData({ ...profileData, [e.target.name]: e.target.value });

    const handleSave = async () => {
        setMessage(''); setError('');
        try {
            const userDocRef = doc(db, "users", userData.uid);
            await updateDoc(userDocRef, { name: profileData.name, level: profileData.level, gender: profileData.gender, birthYear: profileData.birthYear });

            if (profileData.newPassword) {
                if (profileData.newPassword.length < 6) { setError("새 비밀번호는 6자 이상이어야 합니다."); return; }
                if (profileData.newPassword !== profileData.confirmPassword) { setError("새 비밀번호가 일치하지 않습니다."); return; }
                await updatePassword(auth.currentUser, profileData.newPassword);
            }

            setMessage('프로필이 성공적으로 저장되었습니다.');
            Object.assign(userData, { name: profileData.name, level: profileData.level, gender: profileData.gender, birthYear: profileData.birthYear });
        } catch (error) { setError('저장에 실패했습니다: ' + error.message); }
    };

    const birthYears = Array.from({length: 70}, (_, i) => new Date().getFullYear() - i - 15);

    return (
        <div className="bg-black text-white min-h-screen flex items-center justify-center font-sans p-4">
            <div className="bg-gray-800 p-8 rounded-lg shadow-lg w-full max-w-sm">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-3xl font-bold text-yellow-400 arcade-font">프로필</h1>
                    <button onClick={() => setPage('lobby')} className="text-2xl text-gray-500 hover:text-white">&times;</button>
                </div>
                {message && <p className="text-center mb-4 text-green-400">{message}</p>}
                {error && <p className="text-center mb-4 text-red-500">{error}</p>}
                <div className="space-y-3">
                    <div><label className="block text-sm font-bold text-gray-400">아이디</label><p className="w-full bg-gray-900 text-gray-500 p-3 rounded-lg">{userData.username}</p></div>
                    <div><label className="block text-sm font-bold text-gray-400">이름</label><p className="w-full bg-gray-900 text-gray-500 p-3 rounded-lg">{userData.name}</p></div>
                    <div><label className="block text-sm font-bold text-gray-400">연락처</label><p className="w-full bg-gray-900 text-gray-500 p-3 rounded-lg">{userData.phone}</p></div>

                    <hr className="border-gray-600"/>

                    <div><label className="block text-sm font-bold">급수</label><select name="level" value={profileData.level} onChange={handleChange} className="w-full bg-gray-700 text-white p-3 rounded-lg"><option>A조</option><option>B조</option><option>C조</option><option>D조</option></select></div>
                    <div><label className="block text-sm font-bold">성별</label><select name="gender" value={profileData.gender} onChange={handleChange} className="w-full bg-gray-700 text-white p-3 rounded-lg"><option>남</option><option>여</option></select></div>
                    <div><label className="block text-sm font-bold">출생년도</label><select name="birthYear" value={profileData.birthYear} onChange={handleChange} className="w-full bg-gray-700 text-white p-3 rounded-lg">{birthYears.map(y=><option key={y} value={y}>{y}</option>)}</select></div>
                    
                    <hr className="border-gray-600"/>

                    <div><label className="block text-sm font-bold">새 비밀번호</label><input type="password" name="newPassword" placeholder="6자 이상" value={profileData.newPassword} onChange={handleChange} className="w-full bg-gray-700 text-white p-3 rounded-lg"/></div>
                    <div><label className="block text-sm font-bold">새 비밀번호 확인</label><input type="password" name="confirmPassword" value={profileData.confirmPassword} onChange={handleChange} className="w-full bg-gray-700 text-white p-3 rounded-lg"/></div>
                </div>
                <button onClick={handleSave} className="w-full mt-6 arcade-button bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 rounded-lg">저장하기</button>
            </div>
        </div>
    );
}

function GameRoomPage({ userData, roomId, setPage }) {
    const [roomData, setRoomData] = useState(null);
    const [players, setPlayers] = useState({});
    const [selectedPlayerIds, setSelectedPlayerIds] = useState([]);
    const [modal, setModal] = useState({ type: null, data: null });
    const [activeTab, setActiveTab] = useState('matching');
    const [draggedPlayerId, setDraggedPlayerId] = useState(null);

    const isAdmin = useMemo(() => {
        if (!roomData || !userData) return false;
        return SUPER_ADMIN_NAMES.includes(userData.name) || roomData.createdBy === userData.uid || (roomData.admins || []).includes(userData.username) || userData.username === 'domain';
    }, [userData, roomData]);

    useEffect(() => {
        const unsubRoom = onSnapshot(doc(db, 'rooms', roomId), (doc) => doc.exists() ? setRoomData({ id: doc.id, ...doc.data() }) : setPage('lobby'));
        const unsubPlayers = onSnapshot(collection(db, 'rooms', roomId, 'players'), (snapshot) => {
            setPlayers(snapshot.docs.reduce((acc, doc) => ({...acc, [doc.id]: { id: doc.id, ...doc.data() } }), {}));
        });
        return () => { unsubRoom(); unsubPlayers(); };
    }, [roomId, setPage]);
    
    const updateRoomState = useCallback(async (updateLogic) => {
        try { await runTransaction(db, async tx => {
                const roomDoc = await tx.get(doc(db, 'rooms', roomId));
                if (!roomDoc.exists()) throw "Room not found";
                const currentData = roomDoc.data();
                const newData = updateLogic(JSON.parse(JSON.stringify(currentData)));
                tx.update(doc(db, 'rooms', roomId), newData);
            });
        } catch (e) { setModal({ type: 'alert', data: { title: '오류', body: `작업에 실패했습니다: ${e.message}` } }); }
    }, [roomId]);
    
    const playerLocations = useMemo(() => {
        const locations = {};
        if (!roomData || !players) return locations;
        Object.keys(players).forEach(pId => locations[pId] = { location: 'waiting' });
        Object.keys(roomData.scheduledMatches || {}).forEach(matchKey => {
            const match = roomData.scheduledMatches[matchKey];
            if (match) match.forEach((pId, slotIdx) => { if (pId) locations[pId] = { location: 'schedule', matchIndex: parseInt(matchKey, 10), slotIndex: slotIdx }; });
        });
        (roomData.inProgressCourts || []).forEach((court, courtIdx) => {
            if (court && court.players) court.players.forEach((pId, slotIdx) => { if (pId) locations[pId] = { location: 'court', matchIndex: courtIdx, slotIndex: slotIdx }; });
        });
        return locations;
    }, [roomData, players]);

    const waitingPlayers = useMemo(() =>  Object.values(players).filter(p => playerLocations[p.id]?.location === 'waiting').sort((a,b) => (LEVEL_ORDER[a.level]||99)-(LEVEL_ORDER[b.level]||99) || new Date(a.entryTime).getTime()-new Date(b.entryTime).getTime()), [players, playerLocations]);
    const inProgressPlayerIds = useMemo(() => new Set((roomData?.inProgressCourts || []).filter(c=>c&&c.players).flatMap(c=>c.players).filter(Boolean)), [roomData]);

    const handleCardClick = (player) => { if (!isAdmin) return; setSelectedPlayerIds(ids => ids.includes(player.id) ? ids.filter(id => id !== player.id) : [...ids, player.id]); };
    const handleAction = (player) => {
        const loc = playerLocations[player.id];
        if (loc && loc.location === 'schedule') {
             updateRoomState(data => {
                data.scheduledMatches[loc.matchIndex][loc.slotIndex] = null;
                return data;
            });
        }
    };

    const handleSlotClick = (context) => {
        if (!isAdmin || selectedPlayerIds.length === 0) return;
        updateRoomState(data => {
            let targetArray = data.scheduledMatches[context.matchIndex] || Array(PLAYERS_PER_MATCH).fill(null);
            const availableSlots = targetArray.filter(p => p === null).length;
            if (selectedPlayerIds.length > availableSlots) {
                throw new Error("자리가 없습니다.");
            }
            
            const playersToMove = [...selectedPlayerIds];
            playersToMove.forEach(pId => {
                const loc = Object.entries(data.scheduledMatches || {}).find(([_, match]) => (match || []).includes(pId));
                if(loc) data.scheduledMatches[loc[0]][loc[1].indexOf(pId)] = null;
            });
            for (let i = 0; i < PLAYERS_PER_MATCH && playersToMove.length > 0; i++) {
                if (targetArray[i] === null) targetArray[i] = playersToMove.shift();
            }
            data.scheduledMatches[context.matchIndex] = targetArray;
            return data;
        });
        setSelectedPlayerIds([]);
    };

    const handleStartMatch = (matchIndex) => {
        const match = roomData?.scheduledMatches?.[matchIndex] || [];
        if(match.filter(p=>p).length !== PLAYERS_PER_MATCH) return;
        
        const emptyCourts = Array.from({length: roomData.numInProgressCourts}, (_,i) => i).filter(i => !(roomData.inProgressCourts || [])[i]);
        if(emptyCourts.length === 0) { setModal({type:'alert', data:{title: "시작 불가", body: "빈 코트가 없습니다."}}); return; }

        const start = (courtIndex) => {
            updateRoomState(data => {
                data.inProgressCourts[courtIndex] = { players: data.scheduledMatches[matchIndex], startTime: serverTimestamp() };
                for(let i = matchIndex; i < data.numScheduledMatches - 1; i++) { data.scheduledMatches[i] = data.scheduledMatches[String(i+1)] || Array(PLAYERS_PER_MATCH).fill(null); }
                data.scheduledMatches[String(data.numScheduledMatches-1)] = Array(PLAYERS_PER_MATCH).fill(null);
                return data;
            });
            setModal({type: null, data: null});
        };
        if(emptyCourts.length === 1) start(emptyCourts[0]);
        else setModal({type: 'courtSelection', data:{courts: emptyCourts, onSelect: start}});
    };
    
    const handleEndMatch = (courtIndex) => {
        const court = (roomData.inProgressCourts || [])[courtIndex];
        if(!court) return;
        const matchPlayers = court.players.map(pId => players[pId]).filter(Boolean);
        setModal({type:'resultInput', data: {courtIndex, players: matchPlayers, onResultSubmit: processMatchResult}});
    };

    const processMatchResult = async (courtIndex, winners) => {
        if (winners.length !== 2) return;
        const court = (roomData.inProgressCourts || [])[courtIndex];
        if(!court) return;

        const batch = writeBatch(db);
        court.players.forEach(pId => {
            const playerRef = doc(db, 'rooms', roomId, 'players', pId);
            batch.update(playerRef, { todayGames: (players[pId]?.todayGames || 0) + 1 });
        });
        await batch.commit();

        updateRoomState(data => { 
            data.inProgressCourts[courtIndex] = null; 
            return data; 
        });
        setModal({type:null, data:null});
    };

    const handleToggleRest = () => {
        const playerRef = doc(db, 'rooms', roomId, 'players', userData.uid);
        updateDoc(playerRef, { isResting: !players[userData.uid]?.isResting });
    };

    const handleSystemReset = () => {
        setModal({type:'confirm', data:{title:'시스템 초기화', body:'[경고] 모든 경기가 사라지고, 선수들은 대기 명단으로 이동합니다. 계속하시겠습니까?', onConfirm: () => {
            updateRoomState(data => {
                data.scheduledMatches = {};
                data.inProgressCourts = Array(data.numInProgressCourts).fill(null);
                return data;
            });
            setModal({type:null, data:null});
        }}});
    };

    const handleSettingsSave = (settings) => {
        updateRoomState(data => ({ ...data, ...settings }));
        setModal({type:null, data:null});
    };

    const handleExitRoom = async () => {
        await deleteDoc(doc(db, 'rooms', roomId, 'players', userData.uid));
        setPage('lobby');
    };

    const handleClearScheduledMatches = () => {
        setModal({type:'confirm', data:{title:'전체 삭제', body:'모든 예정 경기를 삭제하시겠습니까?', onConfirm: () => {
            updateRoomState(data => { data.scheduledMatches = {}; return data; });
            setModal({type:null, data:null});
        }}});
    };
    
    const handleLongPress = (player) => setModal({ type: 'editGames', data: player });
    const handleSaveGames = async (playerId, games) => {
        await updateDoc(doc(db, 'rooms', roomId, 'players', playerId), { todayGames: games });
        setModal({ type: null, data: null });
    };

    const handleDragStart = (e, playerId) => { e.dataTransfer.setData("playerId", playerId); setDraggedPlayerId(playerId); };
    const handleDragEnd = () => setDraggedPlayerId(null);
    const handleDragOver = (e) => e.preventDefault();
    const handleDrop = (e, target) => {
        e.preventDefault();
        const sourcePlayerId = e.dataTransfer.getData("playerId");
        if (!sourcePlayerId || sourcePlayerId === target.id) return;

        updateRoomState(data => {
            const tempLocations = {};
            Object.keys(players).forEach(pId => tempLocations[pId] = { location: 'waiting' });
            Object.keys(data.scheduledMatches || {}).forEach(mK => (data.scheduledMatches[mK]||[]).forEach((pId, sI) => { if(pId) tempLocations[pId] = { location: 'schedule', matchIndex: parseInt(mK), slotIndex: sI }; }));
            
            const sourceLoc = tempLocations[sourcePlayerId];
            const targetLoc = target.type === 'player' ? tempLocations[target.id] : { location: 'schedule', ...target };

            if(!sourceLoc || !targetLoc || sourceLoc.location !== 'schedule') return data;

            const sourceVal = data.scheduledMatches[sourceLoc.matchIndex][sourceLoc.slotIndex];
            const targetVal = target.type === 'player' && targetLoc.location === 'schedule' ? data.scheduledMatches[targetLoc.matchIndex][targetLoc.slotIndex] : null;

            if (target.type === 'player' && targetLoc.location === 'schedule') {
                data.scheduledMatches[targetLoc.matchIndex][targetLoc.slotIndex] = sourceVal;
            }
            data.scheduledMatches[sourceLoc.matchIndex][sourceLoc.slotIndex] = targetVal;

            if (target.type === 'slot') {
                data.scheduledMatches[target.matchIndex] = data.scheduledMatches[target.matchIndex] || Array(PLAYERS_PER_MATCH).fill(null);
                data.scheduledMatches[target.matchIndex][target.slotIndex] = sourcePlayerId;
            }
            return data;
        });
        setDraggedPlayerId(null);
    }


    if (!roomData) return <div className="bg-black text-white min-h-screen flex items-center justify-center"><p className="arcade-font text-yellow-400">LOADING ROOM...</p></div>;
    
    const renderMatchingContent = () => (
        <div className="flex flex-col gap-4">
            <section className="bg-gray-800/50 rounded-lg p-3">
                <h2 className="text-sm font-bold mb-2 text-yellow-400 arcade-font">대기 명단 ({waitingPlayers.length})</h2>
                <div className="grid grid-cols-5 gap-2">
                    {waitingPlayers.map(p => <PlayerCard key={p.id} player={p} context={{ location: 'waiting', isAdmin: (roomData.admins || []).includes(p.username) }} isAdmin={isAdmin} onCardClick={handleCardClick} onLongPress={handleLongPress} isCurrentUser={userData.uid === p.id} isPlaying={inProgressPlayerIds.has(p.id)} isSelected={selectedPlayerIds.includes(p.id)} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragOver={handleDragOver} onDrop={handleDrop} />)}
                </div>
            </section>
            <section>
                <div className="flex justify-between items-center mb-2 px-1">
                    <h2 className="text-lg font-bold text-cyan-400 arcade-font">경기 예정</h2>
                    {isAdmin && <button onClick={handleClearScheduledMatches} className="arcade-button text-xs bg-red-800 text-white py-1 px-2 rounded-md">전체삭제</button>}
                </div>
                <div className="flex flex-col gap-2">
                    {Array.from({ length: roomData.numScheduledMatches }).map((_, matchIndex) => {
                        const match = roomData.scheduledMatches?.[matchIndex] || Array(PLAYERS_PER_MATCH).fill(null);
                        const playerCount = match.filter(p => p).length;
                        return (
                            <div key={`schedule-${matchIndex}`} className="flex items-center w-full bg-gray-800/60 rounded-lg p-1 gap-1">
                                <p className="flex-shrink-0 w-8 text-center font-bold text-lg text-white arcade-font">{matchIndex + 1}</p>
                                <div className="grid grid-cols-4 gap-1 flex-1 min-w-0">
                                    {Array(PLAYERS_PER_MATCH).fill(null).map((_, slotIndex) => {
                                        const pId = match[slotIndex];
                                        return pId && players[pId] ? <PlayerCard key={pId} player={players[pId]} context={{location: 'schedule', isAdmin: (roomData.admins || []).includes(players[pId].username)}} isAdmin={isAdmin} onCardClick={handleCardClick} onAction={handleAction} onLongPress={handleLongPress} isCurrentUser={userData.uid === pId} isPlaying={inProgressPlayerIds.has(pId)} isSelected={selectedPlayerIds.includes(pId)} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragOver={handleDragOver} onDrop={handleDrop} /> : <EmptySlot key={`s-empty-${matchIndex}-${slotIndex}`} onSlotClick={() => handleSlotClick({ matchIndex, slotIndex })} onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, {type: 'slot', matchIndex, slotIndex})} />
                                    })}
                                </div>
                                <div className="flex-shrink-0 w-16 text-center">
                                    <button className={`arcade-button w-full py-2 px-1 rounded-md font-bold transition duration-300 text-xs ${playerCount === PLAYERS_PER_MATCH && isAdmin ? 'bg-yellow-500 text-black' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`} disabled={playerCount !== PLAYERS_PER_MATCH || !isAdmin} onClick={() => handleStartMatch(matchIndex)}>START</button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>
        </div>
    );

    const renderInProgressContent = () => (
        <section>
            <h2 className="text-lg font-bold mb-2 text-red-500 px-1 arcade-font">경기 진행</h2>
            <div className="flex flex-col gap-2">
                {Array.from({ length: roomData.numInProgressCourts }).map((_, courtIndex) => {
                    const court = (roomData.inProgressCourts || [])[courtIndex];
                    return (
                         <div key={`court-${courtIndex}`} className="flex items-center w-full bg-gray-800/60 rounded-lg p-1 gap-1">
                            <div className="flex-shrink-0 w-8 flex flex-col items-center justify-center"><p className="font-bold text-lg text-white arcade-font">{courtIndex + 1}</p><p className="font-semibold text-[9px] text-gray-400">코트</p></div>
                            <div className="grid grid-cols-4 gap-1 flex-1 min-w-0">
                                {(court?.players || Array(PLAYERS_PER_MATCH).fill(null)).map((pId, slotIndex) => ( pId && players[pId] ? <PlayerCard key={pId} player={players[pId]} context={{ location: 'court', isAdmin: roomData.isPublicAdmin || (roomData.admins || []).includes(players[pId].username) }} isAdmin={isAdmin} isCurrentUser={userData.uid === pId} /> : <EmptySlot key={`c-empty-${courtIndex}-${slotIndex}`} /> ))}
                            </div>
                            <div className="flex-shrink-0 w-16 text-center">
                                <button className={`arcade-button w-full py-2 px-1 rounded-md font-bold transition duration-300 text-xs ${court && isAdmin ? 'bg-red-500 text-white' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`} disabled={!court || !isAdmin} onClick={(e) => { e.stopPropagation(); handleEndMatch(courtIndex); }}>FINISH</button>
                                <CourtTimer court={court} />
                            </div>
                        </div>
                    )
                })}
            </div>
        </section>
    );

    return (
        <div className="bg-black text-white min-h-screen font-sans flex flex-col" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
            {modal.type === 'alert' && <AlertModal {...modal.data} onClose={() => setModal({type:null})} />}
            {modal.type === 'confirm' && <ConfirmationModal {...modal.data} onCancel={() => setModal({type:null})} />}
            {modal.type === 'courtSelection' && <CourtSelectionModal {...modal.data} onCancel={() => setModal({type:null})} />}
            {modal.type === 'resultInput' && <ResultInputModal {...modal.data} onClose={() => setModal({type:null})} />}
            {modal.type === 'settings' && <SettingsModal roomData={roomData} onSave={handleSettingsSave} onCancel={() => setModal({type:null})} onSystemReset={handleSystemReset} />}
            {modal.type === 'editGames' && <EditGamesModal player={modal.data} onSave={handleSaveGames} onClose={() => setModal({type:null})} />}
            
            <header className="flex-shrink-0 p-3 flex items-center justify-between gap-2 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-20 border-b border-gray-700">
                <h1 className="text-lg font-bold text-yellow-400 arcade-font flicker-text flex items-center"><span className="mr-2">⚡</span><span className="uppercase">{roomData.name}</span></h1>
                <div className="flex items-center gap-3">
                    {isAdmin && <button onClick={() => setModal({type: 'settings'})} className="text-gray-400 hover:text-white text-xl"><i className="fas fa-cog"></i></button>}
                    <button onClick={handleToggleRest} className={`arcade-button py-1.5 px-3 rounded-md text-xs font-bold transition-colors ${players[userData.uid]?.isResting ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-300'}`}>{players[userData.uid]?.isResting ? '복귀' : '휴식'}</button>
                    <button onClick={handleExitRoom} className="arcade-button bg-red-600 hover:bg-red-700 text-white font-bold py-1.5 px-3 rounded-md text-xs">나가기</button>
                </div>
            </header>
            
            <div className="p-4 flex-grow">
                <div className="flex justify-center border-b border-gray-700 mb-4">
                    <button onClick={() => setActiveTab('matching')} className={`py-2 px-6 font-bold text-lg ${activeTab === 'matching' ? 'text-yellow-400 border-b-2 border-yellow-400' : 'text-gray-500'}`}>경기 예정</button>
                    <button onClick={() => setActiveTab('inProgress')} className={`py-2 px-6 font-bold text-lg ${activeTab === 'inProgress' ? 'text-yellow-400 border-b-2 border-yellow-400' : 'text-gray-500'}`}>경기 진행</button>
                </div>
                <main className="flex flex-col gap-4">
                    {activeTab === 'matching' ? renderMatchingContent() : renderInProgressContent()}
                </main>
            </div>

            <style>{`
                html, body { -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; user-select: none; }
                .arcade-font { font-family: 'Press Start 2P', cursive; }
                .arcade-button { position: relative; border: 2px solid #222; box-shadow: inset -2px -2px 0px 0px #333, inset 2px 2px 0px 0px #FFF; white-space: nowrap; }
                .arcade-button:active { transform: translateY(2px); box-shadow: inset -1px -1px 0px 0px #333, inset 1px 1px 0px 0px #FFF; }
                @keyframes flicker { 0%, 100% { opacity: 1; text-shadow: 0 0 8px #FFD700; } 50% { opacity: 0.8; text-shadow: 0 0 12px #FFD700; } }
                .flicker-text { animation: flicker 1.5s infinite; }
            `}</style>
        </div>
    );
}


export default function App() {
    const [page, setPage] = useState('auth');
    const [userData, setUserData] = useState(null);
    const [roomId, setRoomId] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                const userDocRef = currentUser.email === 'domain@special.user'
                    ? doc(db, "users", "domain_user_placeholder")
                    : doc(db, "users", currentUser.uid);

                const userDoc = await getDoc(userDocRef);
                
                if (currentUser.email === 'domain@special.user') {
                     setUserData({ uid: 'domain_user_placeholder', username: 'domain', name: 'Domain Admin'});
                     if (page === 'auth') setPage('lobby');
                }
                else if (userDoc.exists()) {
                    setUserData({ uid: currentUser.uid, ...userDoc.data() });
                    if(page === 'auth') setPage('lobby');
                } else { signOut(auth); }
            } else {
                setUserData(null);
                setPage('auth');
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, [page]);

    if (loading) return <div className="bg-black text-white min-h-screen flex items-center justify-center"><p className="arcade-font text-yellow-400">LOADING...</p></div>;

    switch (page) {
        case 'auth': return <AuthPage setPage={setPage} />;
        case 'lobby': return <LobbyPage userData={userData} setPage={setPage} setRoomId={setRoomId} />;
        case 'profile': return <ProfilePage userData={userData} setPage={setPage} />;
        case 'room': return <GameRoomPage userData={userData} roomId={roomId} setPage={setPage} />;
        default: return <AuthPage setPage={setPage} />;
    }
}

