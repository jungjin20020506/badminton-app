import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
    getFirestore, doc, getDoc, setDoc, onSnapshot, 
    collection, deleteDoc, updateDoc, writeBatch, runTransaction,
    addDoc, query, serverTimestamp 
} from 'firebase/firestore';

// ===================================================================================
// Firebase 설정
// ===================================================================================
const firebaseConfig = {
  apiKey: "AIzaSyC-eeHazZ3kVj7aQicdtlnhEmLbbTJHgGE",
  authDomain: "noerror-14ce3.firebaseapp.com",
  projectId: "noerror-14ce3",
  storageBucket: "noerror-14ce3.firebasestorage.app",
  messagingSenderId: "279065154821",
  appId: "1:279065154821:web:812570dde2bdde560a936c",
  measurementId: "G-PFGZGHT9T4"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ===================================================================================
// 상수 및 Helper 함수
// ===================================================================================
const PLAYERS_PER_MATCH = 4;

const generateId = (name) => name.replace(/\s+/g, '_');

const getLevelColor = (level) => {
    switch (level) {
        case 'S조': return '#D1D5DB';
        case 'A조': return '#FF1744';
        case 'B조': return '#FF9100';
        case 'C조': return '#FFD600';
        case 'D조': return '#00E676';
        default: return '#A1A1AA';
    }
};

const calculateLocations = (gameState, players) => {
    const locations = {};
    Object.keys(players).forEach(pId => locations[pId] = { location: 'waiting' });

    if (gameState.scheduledMatches) {
        Object.keys(gameState.scheduledMatches).forEach(matchKey => {
            const match = gameState.scheduledMatches[matchKey];
            if (match) {
                match.forEach((playerId, slotIndex) => {
                    if (playerId) locations[playerId] = { location: 'schedule', matchIndex: parseInt(matchKey), slotIndex: slotIndex };
                });
            }
        });
    }

    if (gameState.inProgressCourts) {
        gameState.inProgressCourts.forEach((court, courtIndex) => {
            if (court && court.players) {
                court.players.forEach((playerId, slotIndex) => {
                    if (playerId) locations[playerId] = { location: 'court', matchIndex: courtIndex, slotIndex: slotIndex };
                });
            }
        });
    }
    return locations;
};

// ===================================================================================
// ★★★ 해결 지점 ★★★
// EntryPage 및 모든 자식/모달 컴포넌트를 ClubSpace 보다 먼저 정의합니다.
// ===================================================================================
function EntryPage({ onEnter, clubId }) {
    const [formData, setFormData] = useState({ name: '', level: 'S조', gender: '남' });
    const playersRef = useMemo(() => collection(db, "clubs", clubId, "players"), [clubId]);

    useEffect(() => {
        const savedUserId = localStorage.getItem(`badminton-currentUser-id-${clubId}`);
        if (savedUserId) {
             getDoc(doc(playersRef, savedUserId)).then(docSnap => {
                if (docSnap.exists()) { setFormData(prev => ({...prev, ...docSnap.data()})); }
            });
        }
    }, [clubId, playersRef]);
    
    const handleChange = (e) => { 
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value })); 
    };
    
    const handleSubmit = (e) => { e.preventDefault(); onEnter(formData); };

    const levelButtons = ['S조', 'A조', 'B조', 'C조', 'D조'].map(level => (
        <button key={level} type="button" name="level" onClick={() => setFormData(prev => ({ ...prev, level }))}
            className={`w-full p-2 rounded-md font-bold transition-colors ${formData.level === level ? 'bg-yellow-500 text-black' : 'bg-gray-600 text-white'}`}
        >{level}</button>
    ));

    return (
        <div className="bg-black text-white min-h-screen flex items-center justify-center font-sans p-4">
            <div className="bg-gray-800 p-8 rounded-lg shadow-lg w-full max-w-sm">
                <h1 className="text-3xl font-bold text-yellow-400 mb-6 text-center">COCK STAR</h1>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <input type="text" name="name" placeholder="이름" value={formData.name} onChange={handleChange} className="w-full bg-gray-700 text-white p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400" required />
                    <div className="grid grid-cols-5 gap-2">{levelButtons}</div>
                    <div className="flex justify-around items-center text-lg">
                        <label className="flex items-center cursor-pointer"><input type="radio" name="gender" value="남" checked={formData.gender === '남'} onChange={handleChange} className="mr-2 h-4 w-4 text-yellow-500 bg-gray-700 border-gray-600 focus:ring-yellow-500" /> 남자</label>
                        <label className="flex items-center cursor-pointer"><input type="radio" name="gender" value="여" checked={formData.gender === '여'} onChange={handleChange} className="mr-2 h-4 w-4 text-pink-500 bg-gray-700 border-gray-600 focus:ring-pink-500" /> 여자</label>
                    </div>
                    <button type="submit" className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 rounded-lg transition duration-300">입장하기</button>
                </form>
            </div>
        </div>
    );
}

const PlayerCard = React.memo(({ player, context, isAdmin, onCardClick, onAction, onLongPress, isCurrentUser, adminNames }) => {
    let pressTimer = null;
    const handleMouseDown = (e) => { e.preventDefault(); pressTimer = setTimeout(() => onLongPress(player), 1000); };
    const handleMouseUp = () => { clearTimeout(pressTimer); };
    const handleContextMenu = (e) => { e.preventDefault(); };
    
    const genderStyle = { boxShadow: `inset 3px 0 0 0 ${player.gender === '남' ? '#3B82F6' : '#EC4899'}` };
    const adminIcon = (player.role === 'admin' || adminNames.includes(player.name)) ? '👑' : '';
    const isWaiting = !context.location;
    const buttonHoverColor = isWaiting ? 'hover:text-red-500' : 'hover:text-yellow-400';
    const buttonIcon = "fas fa-times-circle fa-xs";
    const playerNameClass = `player-name text-white text-[11px] font-bold whitespace-nowrap leading-tight`;
    const playerInfoClass = `player-info text-gray-400 text-[10px] leading-tight mt-px whitespace-nowrap`;
    
    const levelColor = getLevelColor(player.level);
    const isSLevel = player.level === 'S조';
    const levelStyle = {
        color: isSLevel ? '#000000' : levelColor,
        backgroundColor: isSLevel ? levelColor : 'transparent',
        padding: isSLevel ? '0 3px' : '0',
        borderRadius: isSLevel ? '3px' : '0',
        fontWeight: 'bold', fontSize: '14px',
    };
    const cardStyle = { borderColor: context.selected ? '#FBBF24' : 'transparent', ...genderStyle };
    if (isCurrentUser) {
        cardStyle.boxShadow = `${cardStyle.boxShadow}, 0 0 12px 4px rgba(251, 191, 36, 0.9)`;
    }

    return (
        <div 
            className={`player-card bg-gray-700 p-1 rounded-md cursor-pointer border-2 relative flex flex-col justify-center text-center h-14 transition-all duration-300 ${player.isResting ? 'filter grayscale' : ''}`}
            style={cardStyle}
            onClick={() => onCardClick(player.id)}
            onMouseDown={isAdmin ? handleMouseDown : null} onMouseUp={isAdmin ? handleMouseUp : null}
            onTouchStart={isAdmin ? handleMouseDown : null} onTouchEnd={isAdmin ? handleMouseUp : null}
            onMouseLeave={isAdmin ? handleMouseUp : null} onContextMenu={isAdmin ? handleContextMenu : null}
        >
            <div>
                <div className={playerNameClass}>{adminIcon}{player.name}</div>
                <div className={playerInfoClass}><span style={levelStyle}>{player.level.replace('조','')}</span>|{player.gamesPlayed}겜</div>
            </div>
            {isAdmin && (<button onClick={(e) => { e.stopPropagation(); onAction(player); }} className={`absolute -top-2 -right-2 p-1 text-gray-500 ${buttonHoverColor}`} aria-label={isWaiting ? '선수 삭제' : '대기자로 이동'}><i className={buttonIcon}></i></button>)}
        </div>
    );
});

const EmptySlot = ({ onSlotClick }) => (<div className="player-slot h-14 bg-gray-900/50 rounded-md flex items-center justify-center text-gray-500 border-2 border-dashed border-gray-600 cursor-pointer" onClick={onSlotClick}><span className="text-lg">+</span></div>);

const CourtTimer = ({ court }) => {
    const [time, setTime] = useState('00:00');
    useEffect(() => {
        if (court && court.startTime) {
            const timerId = setInterval(() => {
                const now = new Date().getTime();
                const startTime = new Date(court.startTime).getTime();
                const diff = Math.floor((now - startTime) / 1000);
                const minutes = String(Math.floor(diff / 60)).padStart(2, '0');
                const seconds = String(diff % 60).padStart(2, '0');
                setTime(`${minutes}:${seconds}`);
            }, 1000);
            return () => clearInterval(timerId);
        } else { setTime('00:00'); }
    }, [court]);
    return <div className="text-center text-sm font-mono text-white mt-1">{time}</div>;
};

// ... Sections ... (WaitingListSection, ScheduledMatchesSection, InProgressCourtsSection)
// ... Modals ... (ConfirmationModal, CourtSelectionModal, etc.)

function ConfirmationModal({ title, body, onConfirm, onCancel }) { return ( <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"><div className="bg-gray-800 rounded-lg p-6 w-full max-w-sm text-center shadow-lg"><h3 className="text-xl font-bold text-white mb-4">{title}</h3><p className="text-gray-300 mb-6">{body}</p><div className="flex gap-4"><button onClick={onCancel} className="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 rounded-lg transition-colors">취소</button><button onClick={onConfirm} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-lg transition-colors">확인</button></div></div></div>); }
function AlertModal({ title, body, onClose }) { return ( <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"><div className="bg-gray-800 rounded-lg p-6 w-full max-w-sm text-center shadow-lg"><h3 className="text-xl font-bold text-yellow-400 mb-4">{title}</h3><p className="text-gray-300 mb-6">{body}</p><button onClick={onClose} className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-2 rounded-lg transition-colors">확인</button></div></div> ); }
function CourtSelectionModal({ courts, onSelect, onCancel }) { return ( <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"><div className="bg-gray-800 rounded-lg p-6 w-full max-w-sm text-center shadow-lg"><h3 className="text-xl font-bold text-yellow-400 mb-4">코트 선택</h3><p className="text-gray-300 mb-6">경기를 시작할 코트를 선택해주세요.</p><div className="flex flex-col gap-3">{courts.map(courtIdx => ( <button key={courtIdx} onClick={() => onSelect(courtIdx)} className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-2 rounded-lg transition-colors">{courtIdx + 1}번 코트에서 시작</button> ))}</div><button onClick={onCancel} className="mt-6 w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 rounded-lg transition-colors">취소</button></div></div> ); }
function EditGamesModal({ player, onSave, onCancel }) { const [count, setCount] = useState(player.gamesPlayed); return ( <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"><div className="bg-gray-800 rounded-lg p-6 w-full max-w-xs text-center shadow-lg"><h3 className="text-xl font-bold text-yellow-400 mb-4">{player.name} 경기 수 수정</h3><div className="flex items-center justify-center gap-4 my-6"><button onClick={() => setCount(c => Math.max(0, c - 1))} className="px-4 py-2 bg-gray-600 rounded-full text-2xl w-14 h-14 flex items-center justify-center">-</button><span className="text-4xl font-bold w-16 text-center text-white">{count}</span><button onClick={() => setCount(c => c + 1)} className="px-4 py-2 bg-gray-600 rounded-full text-2xl w-14 h-14 flex items-center justify-center">+</button></div><div className="flex gap-4"><button onClick={onCancel} className="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 rounded-lg transition-colors">취소</button><button onClick={() => onSave(count)} className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-2 rounded-lg transition-colors">저장</button></div></div></div> ); }
function MoveCourtModal({ sourceCourtIndex, courts, onSelect, onCancel }) { return ( <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"><div className="bg-gray-800 rounded-lg p-6 w-full max-w-sm text-center shadow-lg"><h3 className="text-xl font-bold text-yellow-400 mb-4">{sourceCourtIndex + 1}번 코트 경기 이동</h3><p className="text-gray-300 mb-6">어느 코트로 이동/교체할까요?</p><div className="flex flex-col gap-3">{courts.map((court, idx) => { if (idx === sourceCourtIndex) return null; return ( <button key={idx} onClick={() => onSelect(sourceCourtIndex, idx)} className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 rounded-lg transition-colors">{idx + 1}번 코트</button> )})}</div><button onClick={onCancel} className="mt-6 w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 rounded-lg transition-colors">취소</button></div></div> ); }
function SettingsModal({ isAdmin, scheduledCount, courtCount, onUpdate, onCancel }) { if (!isAdmin) return null; return ( <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"><div className="bg-gray-800 rounded-lg p-6 w-full max-w-sm text-center shadow-lg"><h3 className="text-xl font-bold text-white mb-6">설정</h3><div className="space-y-4"><div className="flex items-center justify-between bg-gray-700 p-3 rounded-lg"><span className="font-semibold">경기 예정</span><div className="flex items-center gap-4"><button onClick={() => onUpdate('scheduled', Math.max(1, scheduledCount - 1))} className="w-8 h-8 bg-gray-600 rounded-full text-lg">-</button><span className="text-xl font-bold w-8">{scheduledCount}</span><button onClick={() => onUpdate('scheduled', scheduledCount + 1)} className="w-8 h-8 bg-gray-600 rounded-full text-lg">+</button></div></div><div className="flex items-center justify-between bg-gray-700 p-3 rounded-lg"><span className="font-semibold">경기 진행 코트</span><div className="flex items-center gap-4"><button onClick={() => onUpdate('courts', Math.max(1, courtCount - 1))} className="w-8 h-8 bg-gray-600 rounded-full text-lg">-</button><span className="text-xl font-bold w-8">{courtCount}</span><button onClick={() => onUpdate('courts', courtCount + 1)} className="w-8 h-8 bg-gray-600 rounded-full text-lg">+</button></div></div></div><button onClick={onCancel} className="mt-6 w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-lg transition-colors">나가기</button></div></div> ); }


// ===================================================================================
// 경기 관리 메인 컴포넌트 (ClubSpace)
// ===================================================================================
function ClubSpace({ clubId, onLeaveClub, clubData }) {
    const playersRef = useMemo(() => collection(db, "clubs", clubId, "players"), [clubId]);
    const gameStateRef = useMemo(() => doc(db, "clubs", clubId, "gameState", "live"), [clubId]);

    const [players, setPlayers] = useState({});
    const [gameState, setGameState] = useState(null);
    const [currentUser, setCurrentUser] = useState(null);
    const [selectedPlayerIds, setSelectedPlayerIds] = useState([]);
    const [modal, setModal] = useState({ type: null, data: null });
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [authChecked, setAuthChecked] = useState(false);

    const ADMIN_NAMES = useMemo(() => [clubData.adminName], [clubData]);

    const isAdmin = useMemo(() => {
        if (!currentUser) return false;
        if (currentUser.role === 'admin') return true;
        return ADMIN_NAMES.includes(currentUser.name);
    }, [currentUser, ADMIN_NAMES]);
    
    // ... 여기에 기존 App.jsx의 모든 로직 (useEffect, useCallback 핸들러들)을 붙여넣습니다 ...
    // ... (전체 코드는 너무 길어 생략, 아래 주요 함수만 예시로 포함) ...
    const updateGameState = useCallback(async (updateFunction, customErrorMessage) => {
        // ... (내부 로직은 기존과 동일) ...
    }, [gameStateRef]);

    const playerLocations = useMemo(() => {
        if (!gameState) return {};
        return calculateLocations(gameState, players);
    }, [gameState, players]);

    const findPlayerLocation = useCallback((playerId) => playerLocations[playerId] || { location: 'waiting' }, [playerLocations]);

    // 입장 처리
    const handleEnter = useCallback(async (formData) => {
        const { name, level, gender } = formData;
        if (!name) { setModal({ type: 'alert', data: { title: '오류', body: '이름을 입력해주세요.' } }); return; }
        const id = generateId(name);
        try {
            const playerDocRef = doc(playersRef, id);
            let docSnap = await getDoc(playerDocRef);
            let playerData = docSnap.exists() 
                ? { ...docSnap.data(), level, gender, isGuest: false, isResting: false }
                : { id, name, level, gender, isGuest: false, gamesPlayed: 0, entryTime: new Date().toISOString(), isResting: false };
            
            await setDoc(playerDocRef, playerData, { merge: true });
            setCurrentUser(playerData);
            localStorage.setItem(`badminton-currentUser-id-${clubId}`, id);
        } catch (error) {
            setModal({ type: 'alert', data: { title: '오류', body: '입장 처리 중 문제가 발생했습니다.' }});
        }
    }, [playersRef, clubId]);

    // 나가기 (로비로)
    const handleLogout = useCallback(() => {
        if (!currentUser) return;
        setModal({ type: 'confirm', data: { 
            title: '나가기', 
            body: '나가시면 대기 명단과 경기에서 완전히 제외됩니다. 정말 나가시겠습니까?',
            onConfirm: async () => {
                try {
                    // Firestore에서 플레이어 위치 제거 및 플레이어 문서 삭제
                    // ... (이 부분 로직은 기존 코드와 동일하게 구현) ...
                    await deleteDoc(doc(playersRef, currentUser.id));
                    
                    localStorage.removeItem(`badminton-currentUser-id-${clubId}`);
                    setCurrentUser(null);
                    setModal({ type: null, data: null });
                    // onLeaveClub(); // 이 방식 대신 App 컴포넌트에서 currentUser가 null이 되면 로비로 전환되도록 처리 가능
                } catch (error) {
                    setModal({ type: 'alert', data: { title: '오류', body: '나가는 도중 문제가 발생했습니다.' }});
                }
            }
        }});
    }, [currentUser, playersRef, clubId, updateGameState]);
    
    // 이 외 모든 핸들러 함수(handleCardClick, handleSlotClick 등)는 기존 코드와 동일합니다.
    // ...

    useEffect(() => {
        const unsubscribePlayers = onSnapshot(playersRef, (snapshot) => {
            const playersData = {};
            snapshot.forEach(doc => playersData[doc.id] = doc.data());
            setPlayers(playersData);
        });
        
        const unsubscribeGameState = onSnapshot(gameStateRef, (doc) => {
            if (doc.exists()) {
                setGameState(doc.data());
            } else {
                const initialState = { 
                    scheduledMatches: {}, 
                    inProgressCourts: Array(4).fill(null),
                    numScheduledMatches: 4,
                    numInProgressCourts: 4,
                };
                setDoc(gameStateRef, initialState).then(() => setGameState(initialState));
            }
        });
        return () => { unsubscribePlayers(); unsubscribeGameState(); };
    }, [playersRef, gameStateRef]);

    useEffect(() => {
        const savedUserId = localStorage.getItem(`badminton-currentUser-id-${clubId}`);
        if (savedUserId) {
            getDoc(doc(playersRef, savedUserId)).then(docSnap => {
                if (docSnap.exists()) { setCurrentUser(docSnap.data()); } 
                else { localStorage.removeItem(`badminton-currentUser-id-${clubId}`); }
            }).finally(() => setAuthChecked(true));
        } else {
            setAuthChecked(true);
        }
    }, [clubId, playersRef]);


    // 렌더링 로직
    if (!authChecked) {
        return <div className="bg-black text-white min-h-screen flex items-center justify-center font-sans p-4"><div className="text-yellow-400">인증 정보 확인 중...</div></div>;
    }

    if (!currentUser) {
        return <EntryPage onEnter={handleEnter} clubId={clubId} />;
    }

    if (!gameState) {
        return <div className="bg-black text-white min-h-screen flex items-center justify-center font-sans p-4"><div className="text-yellow-400">경기 정보 로딩 중...</div></div>;
    }
    
    // ... (나머지 렌더링 JSX 코드는 기존과 동일)
    return (
        <div className="bg-black text-white min-h-screen font-sans flex flex-col" style={{ minWidth: '320px' }}>
            <header className="flex-shrink-0 p-2 flex justify-between items-center bg-gray-900 sticky top-0 z-10">
                <h1 className="text-lg font-bold text-yellow-400">COCK STAR <span className="text-sm text-white font-normal ml-2">&gt; {clubData.name}</span></h1>
                <div className="flex items-center">
                    <button onClick={onLeaveClub} className="text-gray-400 hover:text-white mr-3 text-xs">[클럽 목록으로]</button>
                    {/* ... 나머지 헤더 버튼들 (휴식, 설정, 나가기 등) ... */}
                    <div className="text-right">
                        <span className="text-xs">{isAdmin ? '👑' : ''} {currentUser.name}</span>
                        <button onClick={handleLogout} className="ml-2 bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-2 rounded-md text-xs">나가기</button>
                    </div>
                </div>
            </header>
            <main className="flex-grow flex flex-col gap-4 p-1">
                {/* ... WaitingListSection, ScheduledMatchesSection 등 ... */}
            </main>
        </div>
    );
}


// ===================================================================================
// 클럽 로비 및 생성 관련 컴포넌트
// ===================================================================================
function ClubLobby({ onClubSelect, onCreateClub }) { /* ... 이전 코드와 동일 ... */ }
function CreateClubModal({ onCreate, onCancel }) { /* ... 이전 코드와 동일 ... */ }
function PasswordModal({ club, onSuccess, onCancel }) { /* ... 이전 코드와 동일 ... */ }


// ===================================================================================
// 최상위 App 컴포넌트 (라우터 역할)
// ===================================================================================
export default function App() {
    const [currentClubId, setCurrentClubId] = useState(null);
    const [clubData, setClubData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    
    useEffect(() => {
        const lastClubId = localStorage.getItem('badminton-last-club-id');
        if (lastClubId) {
            handleClubSelect(lastClubId);
        } else {
            setIsLoading(false);
        }
    }, []);

    const handleClubSelect = async (clubId) => {
        setIsLoading(true);
        try {
            const clubDoc = await getDoc(doc(db, "clubs", clubId));
            if (clubDoc.exists()) {
                setClubData({ id: clubDoc.id, ...clubDoc.data() });
                setCurrentClubId(clubId);
                localStorage.setItem('badminton-last-club-id', clubId);
            } else {
                alert("존재하지 않는 클럽입니다.");
                handleLeaveClub();
            }
        } catch (error) {
            alert("클럽 정보를 불러오는 데 실패했습니다.");
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleCreateClub = async ({ name, password, adminName }) => {
        setIsLoading(true);
        try {
            const clubRef = await addDoc(collection(db, "clubs"), { name, password, adminName, createdAt: serverTimestamp() });
            handleClubSelect(clubRef.id);
        } catch (error) {
            alert("클럽 생성에 실패했습니다.");
            setIsLoading(false);
        }
    };

    const handleLeaveClub = () => {
        setCurrentClubId(null);
        setClubData(null);
        localStorage.removeItem('badminton-last-club-id');
    };

    if (isLoading) {
        return <div className="bg-black text-white min-h-screen flex items-center justify-center font-sans p-4"><div className="text-yellow-400">정보를 불러오는 중...</div></div>;
    }

    if (currentClubId && clubData) {
        return <ClubSpace clubId={currentClubId} onLeaveClub={handleLeaveClub} clubData={clubData} />;
    } else {
        return <ClubLobby onClubSelect={handleClubSelect} onCreateClub={handleCreateClub} />;
    }
}
