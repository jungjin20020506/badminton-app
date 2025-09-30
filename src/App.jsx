import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import {
    getFirestore, doc, getDoc, setDoc, onSnapshot,
    collection, deleteDoc, updateDoc, runTransaction,
    addDoc, serverTimestamp
} from 'firebase/firestore';

// ===================================================================================
// 1. Firebase 설정
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
// 2. 상수 및 전역 Helper 함수
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
    Object.keys(players).forEach(pId => { locations[pId] = { location: 'waiting' } });
    if (!gameState) return locations;

    if (gameState.scheduledMatches) {
        Object.keys(gameState.scheduledMatches).forEach(matchKey => {
            const match = gameState.scheduledMatches[matchKey];
            if (match) match.forEach((playerId, slotIndex) => {
                if (playerId) locations[playerId] = { location: 'schedule', matchIndex: parseInt(matchKey), slotIndex };
            });
        });
    }
    if (gameState.inProgressCourts) {
        gameState.inProgressCourts.forEach((court, courtIndex) => {
            if (court && court.players) court.players.forEach((playerId, slotIndex) => {
                if (playerId) locations[playerId] = { location: 'court', matchIndex: courtIndex, slotIndex };
            });
        });
    }
    return locations;
};

// ===================================================================================
// 3. UI 자식 컴포넌트들 (재사용되는 모든 UI 요소)
// ===================================================================================

// ----------- 입장 페이지 -----------
function EntryPage({ onEnter, clubId }) {
    const [formData, setFormData] = useState({ name: '', level: 'S조', gender: '남' });
    const playersRef = useMemo(() => collection(db, "clubs", clubId, "players"), [clubId]);

    useEffect(() => {
        const savedUserId = localStorage.getItem(`badminton-currentUser-id-${clubId}`);
        if (savedUserId) {
            getDoc(doc(playersRef, savedUserId)).then(docSnap => {
                if (docSnap.exists()) { setFormData(prev => ({ ...prev, ...docSnap.data() })); }
            });
        }
    }, [clubId, playersRef]);

    const handleChange = (e) => { setFormData(prev => ({ ...prev, [e.target.name]: e.target.value })); };
    const handleSubmit = (e) => { e.preventDefault(); onEnter(formData); };
    const levelButtons = ['S조', 'A조', 'B조', 'C조', 'D조'].map(level => (
        <button key={level} type="button" onClick={() => setFormData(prev => ({ ...prev, level }))}
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
                        <label className="flex items-center cursor-pointer"><input type="radio" name="gender" value="남" checked={formData.gender === '남'} onChange={handleChange} className="mr-2 h-4 w-4" /> 남자</label>
                        <label className="flex items-center cursor-pointer"><input type="radio" name="gender" value="여" checked={formData.gender === '여'} onChange={handleChange} className="mr-2 h-4 w-4" /> 여자</label>
                    </div>
                    <button type="submit" className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 rounded-lg transition duration-300">입장하기</button>
                </form>
            </div>
        </div>
    );
}

// ----------- 공용 UI 요소 -----------
const PlayerCard = React.memo(({ player, context, isAdmin, onCardClick, onAction, onLongPress, isCurrentUser, adminNames }) => {
    // ... (이전 코드와 동일, 생략하지 않고 전체 포함)
    let pressTimer = null;
    const handleMouseDown = (e) => { e.preventDefault(); pressTimer = setTimeout(() => onLongPress(player), 1000); };
    const handleMouseUp = () => { clearTimeout(pressTimer); };
    const handleContextMenu = (e) => { e.preventDefault(); };
    const genderStyle = { boxShadow: `inset 3px 0 0 0 ${player.gender === '남' ? '#3B82F6' : '#EC4899'}` };
    const adminIcon = (player.role === 'admin' || adminNames.includes(player.name)) ? '👑' : '';
    const isWaiting = !context.location;
    const levelColor = getLevelColor(player.level);
    const isSLevel = player.level === 'S조';
    const levelStyle = { color: isSLevel ? '#000000' : levelColor, backgroundColor: isSLevel ? levelColor : 'transparent', padding: isSLevel ? '0 3px' : '0', borderRadius: isSLevel ? '3px' : '0', fontWeight: 'bold', fontSize: '14px', };
    const cardStyle = { borderColor: context.selected ? '#FBBF24' : 'transparent', ...genderStyle };
    if (isCurrentUser) { cardStyle.boxShadow = `${cardStyle.boxShadow}, 0 0 12px 4px rgba(251, 191, 36, 0.9)`; }

    return (
        <div
            className={`player-card bg-gray-700 p-1 rounded-md cursor-pointer border-2 relative flex flex-col justify-center text-center h-14 transition-all duration-300 ${player.isResting ? 'filter grayscale' : ''}`}
            style={cardStyle} onClick={() => onCardClick(player.id)} onMouseDown={isAdmin ? handleMouseDown : null} onMouseUp={isAdmin ? handleMouseUp : null} onTouchStart={isAdmin ? handleMouseDown : null} onTouchEnd={isAdmin ? handleMouseUp : null} onMouseLeave={isAdmin ? handleMouseUp : null} onContextMenu={isAdmin ? handleContextMenu : null}
        >
            <div>
                <div className="player-name text-white text-[11px] font-bold whitespace-nowrap leading-tight">{adminIcon}{player.name}</div>
                <div className="player-info text-gray-400 text-[10px] leading-tight mt-px whitespace-nowrap"><span style={levelStyle}>{player.level.replace('조', '')}</span>|{player.gamesPlayed}겜</div>
            </div>
            {isAdmin && (<button onClick={(e) => { e.stopPropagation(); onAction(player); }} className={`absolute -top-2 -right-2 p-1 text-gray-500 ${isWaiting ? 'hover:text-red-500' : 'hover:text-yellow-400'}`}><i className="fas fa-times-circle fa-xs"></i></button>)}
        </div>
    );
});
const EmptySlot = ({ onSlotClick }) => (<div className="player-slot h-14 bg-gray-900/50 rounded-md flex items-center justify-center text-gray-500 border-2 border-dashed border-gray-600 cursor-pointer" onClick={onSlotClick}><span className="text-lg">+</span></div>);
const CourtTimer = ({ court }) => {
    const [time, setTime] = useState('00:00');
    useEffect(() => {
        if (court && court.startTime) {
            const timerId = setInterval(() => {
                const diff = Math.floor((new Date().getTime() - new Date(court.startTime).getTime()) / 1000);
                setTime(`${String(Math.floor(diff / 60)).padStart(2, '0')}:${String(diff % 60).padStart(2, '0')}`);
            }, 1000);
            return () => clearInterval(timerId);
        } else { setTime('00:00'); }
    }, [court]);
    return <div className="text-center text-sm font-mono text-white mt-1">{time}</div>;
};

// ----------- 섹션 컴포넌트 -----------
const WaitingListSection = React.memo(({ maleWaitingPlayers, femaleWaitingPlayers, selectedPlayerIds, isAdmin, handleCardClick, handleDeleteFromWaiting, setModal, currentUser, adminNames }) => (
    <section className="flex-shrink-0 bg-gray-800/50 rounded-lg p-2">
        <h2 className="text-sm font-bold mb-2 text-yellow-400">대기자 명단 ({maleWaitingPlayers.length + femaleWaitingPlayers.length})</h2>
        {maleWaitingPlayers.length > 0 && (<div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
            {maleWaitingPlayers.map(p => (<PlayerCard key={p.id} player={p} context={{ selected: selectedPlayerIds.includes(p.id) }} isAdmin={isAdmin} onCardClick={handleCardClick} onAction={handleDeleteFromWaiting} onLongPress={(player) => setModal({ type: 'editGames', data: { player } })} isCurrentUser={currentUser && p.id === currentUser.id} adminNames={adminNames} />))}
        </div>)}
        {maleWaitingPlayers.length > 0 && femaleWaitingPlayers.length > 0 && (<div className="my-2 border-t-2 border-dashed border-gray-600"></div>)}
        {femaleWaitingPlayers.length > 0 && (<div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
            {femaleWaitingPlayers.map(p => (<PlayerCard key={p.id} player={p} context={{ selected: selectedPlayerIds.includes(p.id) }} isAdmin={isAdmin} onCardClick={handleCardClick} onAction={handleDeleteFromWaiting} onLongPress={(player) => setModal({ type: 'editGames', data: { player } })} isCurrentUser={currentUser && p.id === currentUser.id} adminNames={adminNames} />))}
        </div>)}
    </section>
));
const ScheduledMatchesSection = React.memo(({ numScheduledMatches, scheduledMatches, players, selectedPlayerIds, isAdmin, handleCardClick, handleReturnToWaiting, setModal, handleSlotClick, handleStartMatch, currentUser, adminNames }) => (
    <section>
        <h2 className="text-sm font-bold mb-2 text-yellow-400 px-1">경기 예정</h2>
        <div className="flex flex-col gap-2">
            {Array.from({ length: numScheduledMatches }).map((_, matchIndex) => {
                const match = scheduledMatches[String(matchIndex)] || Array(PLAYERS_PER_MATCH).fill(null);
                const playerCount = match.filter(p => p).length;
                return (<div key={`schedule-${matchIndex}`} className="flex items-center w-full bg-gray-800 rounded-lg p-1 gap-1">
                    <div className="flex-shrink-0 w-12 text-center"><p className="font-semibold text-[10px] text-gray-400">예정</p><p className="font-bold text-base text-white">{matchIndex + 1}</p></div>
                    <div className="grid grid-cols-4 gap-1 flex-1 min-w-0">
                        {match.map((playerId, slotIndex) => {
                            const context = { location: 'schedule', matchIndex, slotIndex, selected: selectedPlayerIds.includes(playerId) };
                            return players[playerId] ? (<PlayerCard key={playerId} player={players[playerId]} context={context} isAdmin={isAdmin} onCardClick={handleCardClick} onAction={handleReturnToWaiting} onLongPress={(p) => setModal({ type: 'editGames', data: { player: p } })} isCurrentUser={currentUser && playerId === currentUser.id} adminNames={adminNames} />) : (<EmptySlot key={`s-empty-${matchIndex}-${slotIndex}`} onSlotClick={() => handleSlotClick(context)} />)
                        })}
                    </div>
                    <div className="flex-shrink-0 w-14 text-center"><button className={`w-full py-2 px-1 rounded-md font-semibold transition duration-300 text-[10px] ${playerCount === PLAYERS_PER_MATCH && isAdmin ? 'bg-yellow-500 hover:bg-yellow-600 text-black' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`} disabled={playerCount !== PLAYERS_PER_MATCH || !isAdmin} onClick={() => handleStartMatch(matchIndex)}>경기 시작</button></div>
                </div>);
            })}
        </div>
    </section>
));
const InProgressCourtsSection = React.memo(({ numInProgressCourts, inProgressCourts, players, selectedPlayerIds, isAdmin, handleCardClick, handleReturnToWaiting, setModal, handleSlotClick, handleEndMatch, currentUser, adminNames }) => (
    <section>
        <h2 className="text-sm font-bold mb-2 text-yellow-400 px-1">경기 진행 코트</h2>
        <div className="flex flex-col gap-2">
            {Array.from({ length: numInProgressCourts }).map((_, courtIndex) => {
                const court = inProgressCourts[courtIndex];
                return (<div key={`court-${courtIndex}`} className="flex items-center w-full bg-gray-800 rounded-lg p-1 gap-1">
                    <div className="flex-shrink-0 w-12 text-center"><p className="font-bold text-base text-white">{courtIndex + 1}</p><p className="font-semibold text-[10px] text-gray-400">코트</p></div>
                    <div className="grid grid-cols-4 gap-1 flex-1 min-w-0">
                        {(court?.players || Array(PLAYERS_PER_MATCH).fill(null)).map((playerId, slotIndex) => {
                            const context = { location: 'court', matchIndex: courtIndex, selected: selectedPlayerIds.includes(playerId) };
                            return players[playerId] ? (<PlayerCard key={playerId} player={players[playerId]} context={context} isAdmin={isAdmin} onCardClick={handleCardClick} onAction={handleReturnToWaiting} onLongPress={() => setModal({ type: 'moveCourt', data: { sourceCourtIndex: courtIndex } })} isCurrentUser={currentUser && playerId === currentUser.id} adminNames={adminNames} />) : (<EmptySlot key={`c-empty-${courtIndex}-${slotIndex}`} onSlotClick={() => handleSlotClick(context)} />)
                        })}
                    </div>
                    <div className="flex-shrink-0 w-14 text-center">
                        <button className={`w-full py-2 px-1 rounded-md font-semibold transition duration-300 text-[10px] ${court && isAdmin ? 'bg-white hover:bg-gray-200 text-black' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`} disabled={!court || !isAdmin} onClick={() => handleEndMatch(courtIndex)}>경기 종료</button>
                        <CourtTimer court={court} />
                    </div>
                </div>);
            })}
        </div>
    </section>
));

// ----------- 모달 컴포넌트 -----------
function ConfirmationModal({ title, body, onConfirm, onCancel }) { return ( <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"><div className="bg-gray-800 rounded-lg p-6 w-full max-w-sm text-center shadow-lg"><h3 className="text-xl font-bold text-white mb-4">{title}</h3><p className="text-gray-300 mb-6">{body}</p><div className="flex gap-4"><button onClick={onCancel} className="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 rounded-lg transition-colors">취소</button><button onClick={onConfirm} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-lg transition-colors">확인</button></div></div></div>); }
function AlertModal({ title, body, onClose }) { return ( <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"><div className="bg-gray-800 rounded-lg p-6 w-full max-w-sm text-center shadow-lg"><h3 className="text-xl font-bold text-yellow-400 mb-4">{title}</h3><p className="text-gray-300 mb-6">{body}</p><button onClick={onClose} className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-2 rounded-lg transition-colors">확인</button></div></div> ); }
function CourtSelectionModal({ courts, onSelect, onCancel }) { return ( <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"><div className="bg-gray-800 rounded-lg p-6 w-full max-w-sm text-center shadow-lg"><h3 className="text-xl font-bold text-yellow-400 mb-4">코트 선택</h3><p className="text-gray-300 mb-6">경기를 시작할 코트를 선택해주세요.</p><div className="flex flex-col gap-3">{courts.map(courtIdx => ( <button key={courtIdx} onClick={() => onSelect(courtIdx)} className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-2 rounded-lg transition-colors">{courtIdx + 1}번 코트에서 시작</button> ))}</div><button onClick={onCancel} className="mt-6 w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 rounded-lg transition-colors">취소</button></div></div> ); }
function EditGamesModal({ player, onSave, onCancel }) { const [count, setCount] = useState(player.gamesPlayed); return ( <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"><div className="bg-gray-800 rounded-lg p-6 w-full max-w-xs text-center shadow-lg"><h3 className="text-xl font-bold text-yellow-400 mb-4">{player.name} 경기 수 수정</h3><div className="flex items-center justify-center gap-4 my-6"><button onClick={() => setCount(c => Math.max(0, c - 1))} className="w-14 h-14 bg-gray-600 rounded-full text-2xl">-</button><span className="text-4xl font-bold w-16 text-center text-white">{count}</span><button onClick={() => setCount(c => c + 1)} className="w-14 h-14 bg-gray-600 rounded-full text-2xl">+</button></div><div className="flex gap-4"><button onClick={onCancel} className="w-full bg-gray-600 hover:bg-gray-700 font-bold py-2 rounded-lg">취소</button><button onClick={() => onSave(count)} className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-2 rounded-lg">저장</button></div></div></div> ); }
function MoveCourtModal({ sourceCourtIndex, courts, onSelect, onCancel }) { return ( <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"><div className="bg-gray-800 rounded-lg p-6 w-full max-w-sm text-center shadow-lg"><h3 className="text-xl font-bold text-yellow-400 mb-4">{sourceCourtIndex + 1}번 코트 경기 이동</h3><p className="text-gray-300 mb-6">어느 코트로 이동/교체할까요?</p><div className="flex flex-col gap-3">{courts.map((court, idx) => { if (idx === sourceCourtIndex) return null; return ( <button key={idx} onClick={() => onSelect(sourceCourtIndex, idx)} className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 rounded-lg transition-colors">{idx + 1}번 코트</button> )})}</div><button onClick={onCancel} className="mt-6 w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 rounded-lg transition-colors">취소</button></div></div> ); }
function SettingsModal({ isAdmin, scheduledCount, courtCount, onUpdate, onCancel }) { if (!isAdmin) return null; return ( <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"><div className="bg-gray-800 rounded-lg p-6 w-full max-w-sm text-center shadow-lg"><h3 className="text-xl font-bold text-white mb-6">설정</h3><div className="space-y-4"><div className="flex items-center justify-between bg-gray-700 p-3 rounded-lg"><span>경기 예정</span><div className="flex items-center gap-4"><button onClick={() => onUpdate('scheduled', Math.max(1, scheduledCount - 1))} className="w-8 h-8 bg-gray-600 rounded-full text-lg">-</button><span className="text-xl font-bold w-8">{scheduledCount}</span><button onClick={() => onUpdate('scheduled', scheduledCount + 1)} className="w-8 h-8 bg-gray-600 rounded-full text-lg">+</button></div></div><div className="flex items-center justify-between bg-gray-700 p-3 rounded-lg"><span>경기 진행 코트</span><div className="flex items-center gap-4"><button onClick={() => onUpdate('courts', Math.max(1, courtCount - 1))} className="w-8 h-8 bg-gray-600 rounded-full text-lg">-</button><span className="text-xl font-bold w-8">{courtCount}</span><button onClick={() => onUpdate('courts', courtCount + 1)} className="w-8 h-8 bg-gray-600 rounded-full text-lg">+</button></div></div></div><button onClick={onCancel} className="mt-6 w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-lg">나가기</button></div></div> ); }


// ===================================================================================
// 4. 경기 관리 메인 컴포넌트 (`ClubSpace`)
// ===================================================================================
function ClubSpace({ clubId, onLeaveClub, clubData }) {
    // Firestore 경로를 clubId에 따라 동적으로 설정
    const playersRef = useMemo(() => collection(db, "clubs", clubId, "players"), [clubId]);
    const gameStateRef = useMemo(() => doc(db, "clubs", clubId, "gameState", "live"), [clubId]);

    // 상태 변수 (State)
    const [players, setPlayers] = useState({});
    const [gameState, setGameState] = useState(null);
    const [currentUser, setCurrentUser] = useState(null);
    const [selectedPlayerIds, setSelectedPlayerIds] = useState([]);
    const [modal, setModal] = useState({ type: null, data: null });
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [authChecked, setAuthChecked] = useState(false);
    
    // 관리자 이름 목록
    const ADMIN_NAMES = useMemo(() => [clubData.adminName], [clubData]);

    // 현재 유저가 관리자인지 확인
    const isAdmin = useMemo(() => {
        if (!currentUser) return false;
        if (currentUser.role === 'admin') return true;
        return ADMIN_NAMES.includes(currentUser.name);
    }, [currentUser, ADMIN_NAMES]);
    
    // 데이터베이스 실시간 구독 (useEffect)
    useEffect(() => {
        const unsubscribePlayers = onSnapshot(playersRef, (snapshot) => {
            const playersData = {};
            snapshot.forEach(doc => { playersData[doc.id] = doc.data() });
            setPlayers(playersData);
        });

        const unsubscribeGameState = onSnapshot(gameStateRef, (doc) => {
            if (doc.exists()) {
                setGameState(doc.data());
            } else { // 새로운 클럽이라 gameState가 없을 경우 초기화
                const initialState = {
                    scheduledMatches: {}, inProgressCourts: Array(4).fill(null),
                    numScheduledMatches: 4, numInProgressCourts: 4,
                };
                setDoc(gameStateRef, initialState).then(() => setGameState(initialState));
            }
        });
        return () => { unsubscribePlayers(); unsubscribeGameState(); };
    }, [playersRef, gameStateRef]);

    // 로컬 저장소에서 현재 유저 정보 불러오기
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

    // currentUser의 휴식 상태가 변경되면 실시간으로 업데이트
    useEffect(() => {
        if (currentUser && players[currentUser.id] && currentUser.isResting !== players[currentUser.id].isResting) {
            setCurrentUser(players[currentUser.id]);
        }
    }, [players, currentUser]);

    // 핵심 로직 함수들 (useCallback)
    const updateGameState = useCallback(async (updateFunction, customErrorMessage) => {
        try {
            await runTransaction(db, async (transaction) => {
                const playerIdsToRead = updateFunction.playerIdsToUpdate || [];
                const playerDocs = {};
                for (const pid of playerIdsToRead) {
                    playerDocs[pid] = await transaction.get(doc(playersRef, pid));
                }
                const gameStateDoc = await transaction.get(gameStateRef);
                if (!gameStateDoc.exists()) throw new Error("Game state 없음!");
                const currentState = gameStateDoc.data();
                const { newState, playerUpdates } = updateFunction(currentState, playerDocs);
                transaction.set(gameStateRef, newState);
                if (playerUpdates) {
                    playerUpdates.forEach(({ id, changes }) => {
                        transaction.update(doc(playersRef, id), changes);
                    });
                }
            });
        } catch (err) {
            console.error("Transaction failed: ", err);
            setModal({ type: 'alert', data: { title: '작업 충돌', body: customErrorMessage || '다른 관리자와 작업이 충돌했습니다. 다시 시도해주세요.' }});
        }
    }, [gameStateRef, playersRef]);

    const playerLocations = useMemo(() => calculateLocations(gameState, players), [gameState, players]);
    const findPlayerLocation = useCallback((playerId) => playerLocations[playerId] || { location: 'waiting' }, [playerLocations]);

    const handleEnter = useCallback(async (formData) => {
        const { name, level, gender } = formData;
        if (!name) { setModal({ type: 'alert', data: { title: '오류', body: '이름을 입력해주세요.' }}); return; }
        const id = generateId(name);
        try {
            const playerDocRef = doc(playersRef, id);
            const docSnap = await getDoc(playerDocRef);
            const playerData = docSnap.exists()
                ? { ...docSnap.data(), level, gender, isGuest: false, isResting: false }
                : { id, name, level, gender, isGuest: false, gamesPlayed: 0, entryTime: new Date().toISOString(), isResting: false };
            await setDoc(playerDocRef, playerData, { merge: true });
            setCurrentUser(playerData);
            localStorage.setItem(`badminton-currentUser-id-${clubId}`, id);
        } catch (error) {
            setModal({ type: 'alert', data: { title: '오류', body: '입장 처리 중 문제가 발생했습니다.' }});
        }
    }, [playersRef, clubId]);

    const handleLogout = useCallback(() => {
        if (!currentUser) return;
        setModal({ type: 'confirm', data: {
            title: '나가기', body: '대기 명단과 경기에서 완전히 제외됩니다. 정말 나가시겠습니까?',
            onConfirm: async () => {
                try {
                    await deleteDoc(doc(playersRef, currentUser.id));
                    localStorage.removeItem(`badminton-currentUser-id-${clubId}`);
                    setCurrentUser(null);
                    setModal({ type: null, data: null });
                } catch (error) {
                    setModal({ type: 'alert', data: { title: '오류', body: '나가는 중 문제가 발생했습니다.' }});
                }
            }
        }});
    }, [currentUser, playersRef, clubId]);

    const handleCardClick = useCallback(async (playerId) => { /* ... 이전 코드와 동일 ... */ }, [isAdmin, selectedPlayerIds, findPlayerLocation, updateGameState]);
    const handleSlotClick = useCallback(async (context) => { /* ... 이전 코드와 동일 ... */ }, [isAdmin, selectedPlayerIds, players, updateGameState]);
    const handleReturnToWaiting = useCallback(async (player) => { /* ... 이전 코드와 동일 ... */ }, [findPlayerLocation, updateGameState]);
    const handleDeleteFromWaiting = useCallback((player) => {
        setModal({ type: 'confirm', data: { title: '선수 내보내기', body: `${player.name} 선수를 내보낼까요?`,
            onConfirm: async () => { 
                await deleteDoc(doc(playersRef, player.id));
                setModal({ type: null, data: null });
            }
        }});
    }, [playersRef]);
    const handleStartMatch = useCallback(async (matchIndex) => { /* ... 이전 코드와 동일 ... */ }, [gameState, updateGameState]);
    const handleEndMatch = useCallback(async (courtIndex) => { /* ... 이전 코드와 동일 ... */ }, [updateGameState]);
    const handleMoveOrSwapCourt = useCallback(async (sourceCourtIndex, targetCourtIndex) => { /* ... 이전 코드와 동일 ... */ }, [updateGameState]);
    const handleSettingsUpdate = useCallback(async (type, count) => {
        await updateDoc(gameStateRef, { [type === 'scheduled' ? 'numScheduledMatches' : 'numInProgressCourts']: count });
    }, [gameStateRef]);
    const handleToggleRest = useCallback(async () => {
        if (!currentUser) return;
        await updateDoc(doc(playersRef, currentUser.id), { isResting: !currentUser.isResting });
    }, [currentUser, playersRef]);
    
    // 렌더링 로직
    if (!authChecked) return <div className="bg-black text-white min-h-screen flex items-center justify-center"><div className="text-yellow-400">인증 정보 확인 중...</div></div>;
    if (!currentUser) return <EntryPage onEnter={handleEnter} clubId={clubId} />;
    if (!gameState) return <div className="bg-black text-white min-h-screen flex items-center justify-center"><div className="text-yellow-400">경기 정보 로딩 중...</div></div>;

    const waitingPlayers = Object.values(players).filter(p => playerLocations[p.id]?.location === 'waiting').sort((a, b) => new Date(a.entryTime) - new Date(b.entryTime));
    const maleWaitingPlayers = waitingPlayers.filter(p => p.gender === '남');
    const femaleWaitingPlayers = waitingPlayers.filter(p => p.gender === '여');

    return (
        <div className="bg-black text-white min-h-screen font-sans flex flex-col" style={{ minWidth: '320px' }}>
            {modal.type && (
                <>
                    {modal.type === 'confirm' && <ConfirmationModal {...modal.data} onCancel={() => setModal({ type: null, data: null })} />}
                    {modal.type === 'alert' && <AlertModal {...modal.data} onClose={() => setModal({ type: null, data: null })} />}
                    {modal.type === 'courtSelection' && <CourtSelectionModal {...modal.data} onCancel={() => setModal({ type: null, data: null })} />}
                    {modal.type === 'editGames' && <EditGamesModal {...modal.data} onCancel={() => setModal({ type: null, data: null })} onSave={async (newCount) => { await updateDoc(doc(playersRef, modal.data.player.id), { gamesPlayed: newCount }); setModal({ type: null, data: null }); }} />}
                    {modal.type === 'moveCourt' && <MoveCourtModal {...modal.data} courts={gameState.inProgressCourts} onSelect={handleMoveOrSwapCourt} onCancel={() => setModal({ type: null, data: null })} />}
                </>
            )}
            {isSettingsOpen && <SettingsModal isAdmin={isAdmin} scheduledCount={gameState.numScheduledMatches} courtCount={gameState.numInProgressCourts} onUpdate={handleSettingsUpdate} onCancel={() => setIsSettingsOpen(false)} />}
            
            <header className="flex-shrink-0 p-2 flex justify-between items-center bg-gray-900 sticky top-0 z-10">
                <h1 className="text-lg font-bold text-yellow-400">COCK STAR <span className="text-sm text-white font-normal ml-2">&gt; {clubData.name}</span></h1>
                <div className="flex items-center">
                    <button onClick={onLeaveClub} className="text-gray-400 hover:text-white mr-3 text-xs">[클럽 목록으로]</button>
                    <button onClick={handleToggleRest} className={`mr-3 py-1 px-2 rounded-md text-xs font-bold transition-colors ${currentUser.isResting ? 'bg-blue-500 hover:bg-blue-600' : 'bg-gray-600 hover:bg-gray-700'}`}>{currentUser.isResting ? '휴식 종료' : '휴식 시작'}</button>
                    {isAdmin && <button onClick={() => setIsSettingsOpen(true)} className="text-gray-400 hover:text-white mr-3 text-lg"><i className="fas fa-cog"></i></button>}
                    <div className="text-right">
                        <span className="text-xs">{isAdmin ? '👑' : ''} {currentUser.name}</span>
                        <button onClick={handleLogout} className="ml-2 bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-2 rounded-md text-xs">나가기</button>
                    </div>
                </div>
            </header>
            <main className="flex-grow flex flex-col gap-4 p-1">
                <WaitingListSection {...{ maleWaitingPlayers, femaleWaitingPlayers, selectedPlayerIds, isAdmin, handleCardClick, handleDeleteFromWaiting, setModal, currentUser, adminNames: ADMIN_NAMES }} />
                <ScheduledMatchesSection {...{ numScheduledMatches: gameState.numScheduledMatches, scheduledMatches: gameState.scheduledMatches, players, selectedPlayerIds, isAdmin, handleCardClick, handleReturnToWaiting, setModal, handleSlotClick, handleStartMatch, currentUser, adminNames: ADMIN_NAMES }} />
                <InProgressCourtsSection {...{ numInProgressCourts: gameState.numInProgressCourts, inProgressCourts: gameState.inProgressCourts, players, selectedPlayerIds, isAdmin, handleCardClick, handleReturnToWaiting, setModal, handleSlotClick, handleEndMatch, currentUser, adminNames: ADMIN_NAMES }} />
            </main>
            <style>{`.player-card {-webkit-user-select: none; user-select: none;}`}</style>
        </div>
    );
}


// ===================================================================================
// 5. 클럽 로비 관련 컴포넌트
// ===================================================================================
function ClubLobby({ onClubSelect, onCreateClub }) {
    const [clubs, setClubs] = useState([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(null);

    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, "clubs"), (snapshot) => {
            setClubs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsubscribe();
    }, []);

    const handlePasswordSuccess = (clubId) => {
        onClubSelect(clubId);
        setShowPasswordModal(null);
    };
    
    return (
        <div className="bg-black text-white min-h-screen flex items-center justify-center font-sans p-4">
            <div className="bg-gray-800 p-8 rounded-lg shadow-lg w-full max-w-md">
                <h1 className="text-3xl font-bold text-yellow-400 mb-6 text-center">COCK STAR</h1>
                <p className="text-center text-gray-400 mb-6">입장할 클럽을 선택하거나 새 클럽을 만드세요.</p>
                <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
                    {clubs.map(club => (
                        <div key={club.id} onClick={() => setShowPasswordModal(club)} className="bg-gray-700 p-4 rounded-lg flex justify-between items-center cursor-pointer hover:bg-gray-600 transition-colors">
                            <span className="font-bold">{club.name}</span>
                            <span className="text-xs text-gray-400">🔒 입장하기</span>
                        </div>
                    ))}
                </div>
                <button onClick={() => setShowCreateModal(true)} className="mt-6 w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 rounded-lg transition">+ 새 클럽 만들기</button>
            </div>
            {showCreateModal && <CreateClubModal onCreate={onCreateClub} onCancel={() => setShowCreateModal(false)} />}
            {showPasswordModal && <PasswordModal club={showPasswordModal} onSuccess={handlePasswordSuccess} onCancel={() => setShowPasswordModal(null)} />}
        </div>
    );
}

function CreateClubModal({ onCreate, onCancel }) {
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [adminName, setAdminName] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!name || !password || !adminName) { setError('모든 필드를 입력해주세요.'); return; }
        await onCreate({ name, password, adminName });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-sm text-center shadow-lg">
                <h3 className="text-xl font-bold text-white mb-6">새 클럽 만들기</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="클럽 이름" className="w-full bg-gray-700 p-3 rounded-lg" />
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="비밀번호" className="w-full bg-gray-700 p-3 rounded-lg" />
                    <input type="text" value={adminName} onChange={e => setAdminName(e.target.value)} placeholder="초대 관리자 이름" className="w-full bg-gray-700 p-3 rounded-lg" />
                    {error && <p className="text-red-500 text-sm">{error}</p>}
                    <div className="flex gap-4 pt-2">
                        <button type="button" onClick={onCancel} className="w-full bg-gray-600 hover:bg-gray-700 py-2 rounded-lg">취소</button>
                        <button type="submit" className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-2 rounded-lg">생성</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function PasswordModal({ club, onSuccess, onCancel }) {
    const [password, setPassword] = useState('');
    const [error, setError] = useState(false);

    const handleEnter = async () => {
        const clubDoc = await getDoc(doc(db, "clubs", club.id));
        if (clubDoc.exists() && clubDoc.data().password === password) {
            onSuccess(club.id);
        } else {
            setError(true);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-sm text-center shadow-lg">
                <h3 className="text-xl font-bold text-white mb-4">'{club.name}' 입장</h3>
                <p className="text-gray-300 mb-6">비밀번호를 입력하세요.</p>
                <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(false); }} onKeyPress={(e) => e.key === 'Enter' && handleEnter()}
                    className={`w-full bg-gray-700 p-3 rounded-lg focus:outline-none focus:ring-2 ${error ? 'ring-red-500' : 'focus:ring-yellow-400'}`} autoFocus />
                {error && <p className="text-red-500 text-sm mt-2">비밀번호가 틀렸습니다.</p>}
                <div className="flex gap-4 mt-6">
                    <button onClick={onCancel} className="w-full bg-gray-600 hover:bg-gray-700 py-2 rounded-lg">취소</button>
                    <button onClick={handleEnter} className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-2 rounded-lg">입장</button>
                </div>
            </div>
        </div>
    );
}

// ===================================================================================
// 6. 최상위 App 컴포넌트 (페이지 라우터 역할)
// ===================================================================================
export default function App() {
    const [currentClubId, setCurrentClubId] = useState(null);
    const [clubData, setClubData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const lastClubId = localStorage.getItem('badminton-last-club-id');
        if (lastClubId) {
            handleClubSelect(lastClubId, true);
        } else {
            setIsLoading(false);
        }
    }, []);

    const handleClubSelect = async (clubId, isInitialLoad = false) => {
        if (!isInitialLoad) setIsLoading(true);
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
        return <div className="bg-black text-white min-h-screen flex items-center justify-center"><div className="text-yellow-400">정보를 불러오는 중...</div></div>;
    }

    if (currentClubId && clubData) {
        return <ClubSpace clubId={currentClubId} onLeaveClub={handleLeaveClub} clubData={clubData} />;
    } else {
        return <ClubLobby onClubSelect={handleClubSelect} onCreateClub={handleCreateClub} />;
    }
}
