import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
    getFirestore, doc, getDoc, setDoc, onSnapshot, 
    collection, deleteDoc, updateDoc, writeBatch 
} from 'firebase/firestore';

// ===================================================================================
// Firebase 설정 (제공해주신 정보로 업데이트)
// ===================================================================================
const firebaseConfig = {
  apiKey: "AIzaSyCKT1JZ8MkA5WhBdL3XXxtm_0wLbnOBi5I",
  authDomain: "project-104956788310687609.firebaseapp.com",
  projectId: "project-104956788310687609",
  storageBucket: "project-104956788310687609.firebasestorage.app",
  messagingSenderId: "384562806148",
  appId: "1:384562806148:web:d8bfb83b28928c13e671d1"
};


// Firebase 초기화
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 데이터베이스 참조
const playersRef = collection(db, "players");
const gameStateRef = doc(db, "gameState", "live");

const ADMIN_NAMES = ["나채빈", "정형진", "윤지혜", "이상민", "이정문", "신영은", "오미리"];

// ===================================================================================
// Helper 함수
// ===================================================================================
const generateId = (name) => name.replace(/\s+/g, '_');


// ===================================================================================
// 자식 컴포넌트들
// ===================================================================================

// 플레이어 카드 컴포넌트
const PlayerCard = ({ player, context, isAdmin, onCardClick, onReturn, onDelete, onLongPress }) => {
    let pressTimer = null;

    const handleMouseDown = (e) => {
        // 기본 동작(예: 드래그)을 방지하여 롱프레스와 클릭을 구분하기 쉽게 함
        e.preventDefault();
        pressTimer = setTimeout(() => onLongPress(player), 1500);
    };

    const handleMouseUp = () => {
        clearTimeout(pressTimer);
    };
    
    const genderColor = player.gender === '남' ? 'text-blue-400' : 'text-pink-400';
    const adminIcon = ADMIN_NAMES.includes(player.name) ? '👑' : '';

    return (
        <div 
            className={`player-card bg-gray-700 p-2 rounded-lg cursor-pointer border-2 relative flex flex-col justify-center text-center ${context.selected ? 'border-yellow-400 shadow-yellow' : 'border-transparent'}`}
            onClick={() => onCardClick(player.id)}
            onMouseDown={isAdmin ? handleMouseDown : null}
            onMouseUp={isAdmin ? handleMouseUp : null}
            onTouchStart={isAdmin ? handleMouseDown : null}
            onTouchEnd={isAdmin ? handleMouseUp : null}
            onMouseLeave={isAdmin ? handleMouseUp : null}
        >
            <div className="player-name text-white text-sm font-bold truncate">{adminIcon} {player.name}</div>
            <div className="player-info text-gray-400 text-xs">
                <span className={genderColor}>{player.gender}</span>|{player.level}|{player.gamesPlayed}겜
            </div>
            {isAdmin && context.location && (
                <button onClick={(e) => { e.stopPropagation(); onReturn(player.id); }} className="absolute top-1 right-1 p-1 text-gray-500 hover:text-yellow-400">
                    <i className="fas fa-times-circle fa-sm"></i>
                </button>
            )}
            {isAdmin && !context.location && (
                 <button onClick={(e) => { e.stopPropagation(); onDelete(player); }} className="absolute top-1 right-1 p-1 text-gray-500 hover:text-red-500">
                    <i className="fas fa-times-circle fa-sm"></i>
                </button>
            )}
        </div>
    );
};

// 빈 슬롯 컴포넌트
const EmptySlot = ({ onSlotClick }) => (
    <div 
        className="player-slot min-h-[72px] bg-gray-900/50 rounded-lg flex items-center justify-center text-gray-500 border-2 border-dashed border-gray-600 cursor-pointer"
        onClick={onSlotClick}
    >
        <span>+</span>
    </div>
);


// 경기 진행 코트 타이머 컴포넌트
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
        } else {
            setTime('00:00');
        }
    }, [court]);

    return <div className="text-center text-2xl font-mono my-3 text-white">{time}</div>;
};

// ===================================================================================
// 메인 앱 컴포넌트
// ===================================================================================
export default function App() {
    // --- 상태 관리 (State) ---
    const [players, setPlayers] = useState({});
    const [scheduledMatches, setScheduledMatches] = useState([[], [], [], []]);
    const [inProgressCourts, setInProgressCourts] = useState([null, null, null, null]);
    
    const [currentUser, setCurrentUser] = useState(null);
    const [selectedPlayerIds, setSelectedPlayerIds] = useState([]);
    
    // 모달 상태
    const [modal, setModal] = useState({ type: null, data: null });

    // --- 파생된 상태 (Derived State) ---
    const isAdmin = useMemo(() => currentUser && ADMIN_NAMES.includes(currentUser.name), [currentUser]);

    // --- Firebase 데이터 구독 (Side Effects) ---
    useEffect(() => {
        // Players 컬렉션 구독
        const unsubscribePlayers = onSnapshot(playersRef, (snapshot) => {
            const playersData = {};
            snapshot.forEach(doc => playersData[doc.id] = doc.data());
            setPlayers(playersData);
        });

        // GameState 문서 구독
        const unsubscribeGameState = onSnapshot(gameStateRef, (doc) => {
            if (doc.exists()) {
                const data = doc.data();
                
                // scheduledMatches 형식 변환
                const firestoreMatches = data.scheduledMatches || {};
                const newScheduledMatches = Array(4).fill(null).map((_, i) => {
                    const match = firestoreMatches[String(i)] || [];
                    return Array(4).fill(null).map((__, j) => match[j] || null);
                });
                setScheduledMatches(newScheduledMatches);

                // inProgressCourts 형식 보정
                const courtsFromDB = Array.isArray(data.inProgressCourts) ? data.inProgressCourts : [];
                const newInProgressCourts = Array(4).fill(null).map((_, i) => courtsFromDB[i] || null);
                setInProgressCourts(newInProgressCourts);
            } else {
                // 초기 상태 문서 생성
                const initialState = {
                    scheduledMatches: { "0": [], "1": [], "2": [], "3": [] },
                    inProgressCourts: [null, null, null, null]
                };
                setDoc(gameStateRef, initialState);
            }
        });

        // 컴포넌트 언마운트 시 구독 해제
        return () => {
            unsubscribePlayers();
            unsubscribeGameState();
        };
    }, []);

    // 페이지 로드 시 자동 로그인
    useEffect(() => {
        const savedUserId = sessionStorage.getItem('badminton-currentUser-id');
        if (savedUserId && !currentUser) {
            getDoc(doc(playersRef, savedUserId)).then(docSnap => {
                if (docSnap.exists()) {
                    setCurrentUser(docSnap.data());
                } else {
                    sessionStorage.removeItem('badminton-currentUser-id');
                }
            });
        }
    }, [currentUser]);


    // --- Helper 함수들 (useCallback으로 최적화) ---
    const updateGameState = useCallback(async (newState) => {
        const scheduledMatchesForFirestore = {};
        (newState.scheduledMatches || []).forEach((match, index) => {
            scheduledMatchesForFirestore[String(index)] = match || Array(4).fill(null);
        });
        await setDoc(gameStateRef, {
            scheduledMatches: scheduledMatchesForFirestore,
            inProgressCourts: newState.inProgressCourts || [null, null, null, null]
        }, { merge: true });
    }, []);

    const findPlayerLocation = useCallback((playerId) => {
        for (let i = 0; i < 4; i++) {
            if (scheduledMatches[i]) {
                const j = scheduledMatches[i].indexOf(playerId);
                if (j > -1) return { location: 'schedule', matchIndex: i, slotIndex: j };
            }
            const court = inProgressCourts[i];
            if (court && court.players) {
                const j = court.players.indexOf(playerId);
                if (j > -1) return { location: 'court', matchIndex: i, slotIndex: j };
            }
        }
        return { location: 'waiting' };
    }, [scheduledMatches, inProgressCourts]);

    // --- 이벤트 핸들러 ---
    const handleEnter = useCallback(async (formData) => {
        const { name, level, gender } = formData;
        if (!name) { alert('이름을 입력해주세요.'); return; }
        
        const id = generateId(name);
        const playerDocRef = doc(playersRef, id);
        let docSnap = await getDoc(playerDocRef);
        let playerData;

        if (!docSnap.exists()) {
            playerData = { id, name, level, gender, gamesPlayed: 0, entryTime: new Date().toISOString() };
            await setDoc(playerDocRef, playerData);
        } else {
            playerData = docSnap.data();
        }

        setCurrentUser(playerData);
        sessionStorage.setItem('badminton-currentUser-id', id);
    }, []);

    const handleExit = useCallback(() => {
        if (currentUser) {
            setModal({
                type: 'confirm',
                data: {
                    title: '나가기',
                    body: '대기 명단에서 자신을 삭제하고 나가시겠습니까?',
                    onConfirm: async () => {
                        await deleteDoc(doc(playersRef, currentUser.id));
                        sessionStorage.removeItem('badminton-currentUser-id');
                        setCurrentUser(null);
                        setModal({ type: null, data: null });
                    }
                }
            });
        }
    }, [currentUser]);

    const handleCardClick = useCallback((playerId) => {
        if (!isAdmin) return;

        if (selectedPlayerIds.includes(playerId)) {
            setSelectedPlayerIds(ids => ids.filter(id => id !== playerId));
        } else {
            if (selectedPlayerIds.length === 0) {
                setSelectedPlayerIds([playerId]);
            } else {
                const firstSelectedId = selectedPlayerIds[0];
                const locA = findPlayerLocation(firstSelectedId);
                const locB = findPlayerLocation(playerId);

                if (locA.location === 'waiting' || locB.location === 'waiting') {
                    setSelectedPlayerIds([]);
                    return;
                }
                
                const newState = { 
                    scheduledMatches: JSON.parse(JSON.stringify(scheduledMatches)), 
                    inProgressCourts: JSON.parse(JSON.stringify(inProgressCourts)) 
                };

                const getValue = (loc) => loc.location === 'schedule' ? newState.scheduledMatches[loc.matchIndex][loc.slotIndex] : newState.inProgressCourts[loc.matchIndex].players[loc.slotIndex];
                const setValue = (loc, value) => {
                    if (loc.location === 'schedule') newState.scheduledMatches[loc.matchIndex][loc.slotIndex] = value;
                    else if(loc.location === 'court') newState.inProgressCourts[loc.matchIndex].players[loc.slotIndex] = value;
                };

                const valA = getValue(locA);
                const valB = getValue(locB);
                setValue(locA, valB);
                setValue(locB, valA);

                updateGameState(newState);
                setSelectedPlayerIds([]);
            }
        }
    }, [isAdmin, selectedPlayerIds, findPlayerLocation, scheduledMatches, inProgressCourts, updateGameState]);
    
    const handleSlotClick = useCallback(async (context) => {
        if (!isAdmin || selectedPlayerIds.length === 0) return;

        const playerToMoveId = selectedPlayerIds[0];
        const originalLoc = findPlayerLocation(playerToMoveId);

        if (originalLoc.location === 'court') {
            setSelectedPlayerIds([]);
            return;
        }

        const newState = { 
            scheduledMatches: JSON.parse(JSON.stringify(scheduledMatches)), 
            inProgressCourts: JSON.parse(JSON.stringify(inProgressCourts)) 
        };

        if (originalLoc.location === 'schedule') {
            newState.scheduledMatches[originalLoc.matchIndex][originalLoc.slotIndex] = null;
        }

        if (context.location === 'schedule') {
            const { matchIndex, slotIndex } = context;
            if (!newState.scheduledMatches[matchIndex][slotIndex]) {
                 newState.scheduledMatches[matchIndex][slotIndex] = playerToMoveId;
            } else {
                 setSelectedPlayerIds([]);
                 return;
            }
        }

        setSelectedPlayerIds([]);
        await updateGameState(newState);

    }, [isAdmin, selectedPlayerIds, scheduledMatches, inProgressCourts, findPlayerLocation, updateGameState]);
    
    const handleStartMatch = useCallback((matchIndex) => {
        const match = scheduledMatches[matchIndex] || [];
        if (match.filter(p => p).length !== 4) return;

        const emptyCourts = inProgressCourts.map((c, i) => c ? -1 : i).filter(i => i !== -1);
        if (emptyCourts.length === 0) { alert("빈 코트가 없습니다."); return; }

        const start = async (courtIndex) => {
            const playersToMove = scheduledMatches[matchIndex].filter(p => p);
            
            const batch = writeBatch(db);
            playersToMove.forEach(playerId => {
                const player = players[playerId];
                if (player) {
                    const playerRef = doc(playersRef, playerId);
                    batch.update(playerRef, { gamesPlayed: player.gamesPlayed + 1 });
                }
            });
            await batch.commit();

            const newState = {
                scheduledMatches: JSON.parse(JSON.stringify(scheduledMatches)), 
                inProgressCourts: JSON.parse(JSON.stringify(inProgressCourts)) 
            };
            newState.inProgressCourts[courtIndex] = { players: playersToMove, startTime: new Date().toISOString() };
            newState.scheduledMatches.splice(matchIndex, 1);
            newState.scheduledMatches.push(Array(4).fill(null));

            await updateGameState(newState);
            setModal({ type: null, data: null });
        };

        if (emptyCourts.length === 1) {
            start(emptyCourts[0]);
        } else {
            setModal({ type: 'courtSelection', data: { emptyCourts, onSelect: start } });
        }
    }, [scheduledMatches, inProgressCourts, players, updateGameState]);

    const handleEndMatch = useCallback(async (courtIndex) => {
        const newState = { ...JSON.parse(JSON.stringify({ scheduledMatches, inProgressCourts })) };
        newState.inProgressCourts[courtIndex] = null;
        await updateGameState(newState);
    }, [scheduledMatches, inProgressCourts, updateGameState]);

    // --- 렌더링 로직 ---
    if (!currentUser) {
        return <EntryPage onEnter={handleEnter} />;
    }

    const waitingPlayers = Object.values(players)
        .filter(p => !findPlayerLocation(p.id) || findPlayerLocation(p.id).location === 'waiting')
        .sort((a, b) => new Date(a.entryTime) - new Date(b.entryTime));

    return (
        <div className="bg-black text-white min-h-screen font-sans">
            {modal.type === 'confirm' && (
                <ConfirmationModal 
                    title={modal.data.title} 
                    body={modal.data.body}
                    onConfirm={modal.data.onConfirm}
                    onCancel={() => setModal({ type: null, data: null })}
                />
            )}
            {modal.type === 'courtSelection' && (
                <CourtSelectionModal
                    courts={modal.data.emptyCourts}
                    onSelect={modal.data.onSelect}
                    onCancel={() => setModal({ type: null, data: null })}
                />
            )}
             {modal.type === 'editGames' && (
                <EditGamesModal
                    player={modal.data.player}
                    onSave={async (newCount) => {
                        await updateDoc(doc(playersRef, modal.data.player.id), { gamesPlayed: newCount });
                        setModal({ type: null, data: null });
                    }}
                    onCancel={() => setModal({ type: null, data: null })}
                />
            )}

            <header className="p-4 flex justify-between items-center bg-gray-900 sticky top-0 z-10">
                <h1 className="text-2xl font-bold text-yellow-400">Cockslighting</h1>
                <div className="text-right">
                    <span className="text-sm">{isAdmin ? '👑' : ''} {currentUser.name}</span>
                    <button onClick={handleExit} className="ml-4 bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-3 rounded-lg text-sm">나가기</button>
                </div>
            </header>

            <main className="p-4 space-y-6">
                <section>
                    <h2 className="text-xl font-bold mb-3 text-yellow-400">대기자 명단 ({waitingPlayers.length})</h2>
                    <div id="waiting-list" className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
                        {waitingPlayers.map(player => (
                            <PlayerCard 
                                key={player.id} 
                                player={player} 
                                context={{ location: null, selected: selectedPlayerIds.includes(player.id) }}
                                isAdmin={isAdmin}
                                onCardClick={handleCardClick}
                                onDelete={(p) => setModal({type: 'confirm', data: { title: `${p.name}님 삭제`, body: '대기 명단에서 이 선수를 삭제하시겠습니까?', onConfirm: () => deleteDoc(doc(playersRef, p.id))}})}
                                onLongPress={(p) => setModal({type: 'editGames', data: { player: p }})}
                            />
                        ))}
                    </div>
                </section>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <section>
                        <h2 className="text-xl font-bold mb-3 text-yellow-400">경기 예정</h2>
                        <div id="scheduled-matches" className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {scheduledMatches.map((match, matchIndex) => (
                                <div key={matchIndex} className="bg-gray-800 rounded-lg p-3 flex flex-col h-full">
                                    <h3 className="font-bold text-center mb-2 text-white">경기 예정 {matchIndex + 1}</h3>
                                    <div className="grid grid-cols-2 gap-2 flex-grow">
                                        {Array(4).fill(null).map((_, slotIndex) => {
                                            const playerId = match[slotIndex];
                                            const player = players[playerId];
                                            const context = { location: 'schedule', matchIndex, slotIndex };
                                            return player ? (
                                                <PlayerCard 
                                                    key={playerId} 
                                                    player={player} 
                                                    context={{...context, selected: selectedPlayerIds.includes(playerId)}}
                                                    isAdmin={isAdmin}
                                                    onCardClick={handleCardClick}
                                                    onReturn={async (pid) => {
                                                        const newState = { scheduledMatches: JSON.parse(JSON.stringify(scheduledMatches)), inProgressCourts };
                                                        const loc = findPlayerLocation(pid);
                                                        if(loc.location === 'schedule') newState.scheduledMatches[loc.matchIndex][loc.slotIndex] = null;
                                                        await updateGameState(newState);
                                                    }}
                                                    onLongPress={(p) => setModal({type: 'editGames', data: { player: p }})}
                                                />
                                            ) : (
                                                <EmptySlot key={slotIndex} onSlotClick={() => handleSlotClick(context)} />
                                            )
                                        })}
                                    </div>
                                    <button 
                                        className={`w-full mt-3 py-2 px-4 rounded-lg font-bold transition duration-300 flex-shrink-0 ${match.filter(p=>p).length === 4 && isAdmin ? 'bg-yellow-500 hover:bg-yellow-600 text-black' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}
                                        disabled={match.filter(p=>p).length !== 4 || !isAdmin}
                                        onClick={() => handleStartMatch(matchIndex)}
                                    >
                                        경기 시작
                                    </button>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold mb-3 text-yellow-400">경기 진행 코트</h2>
                        <div id="in-progress-courts" className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           {inProgressCourts.map((court, courtIndex) => (
                               <div key={courtIndex} className="bg-gray-800 rounded-lg p-3 h-full flex flex-col">
                                   <h3 className="font-bold text-center mb-2 text-white">{courtIndex + 1}번 코트</h3>
                                   <div className="grid grid-cols-2 gap-2 flex-grow">
                                        {(court?.players || Array(4).fill(null)).map((playerId, slotIndex) => {
                                            const player = players[playerId];
                                            return player ? (
                                                <PlayerCard 
                                                    key={playerId || slotIndex} 
                                                    player={player} 
                                                    context={{ location: 'court', selected: selectedPlayerIds.includes(playerId) }}
                                                    isAdmin={isAdmin}
                                                    onCardClick={handleCardClick}
                                                    onReturn={async (pid) => {
                                                        const newState = { scheduledMatches, inProgressCourts: JSON.parse(JSON.stringify(inProgressCourts)) };
                                                        const loc = findPlayerLocation(pid);
                                                        if(loc.location === 'court') {
                                                            newState.inProgressCourts[loc.matchIndex].players[loc.slotIndex] = null;
                                                            if (newState.inProgressCourts[loc.matchIndex].players.every(p => p === null)) {
                                                                newState.inProgressCourts[loc.matchIndex] = null;
                                                            }
                                                        }
                                                        await updateGameState(newState);
                                                    }}
                                                    onLongPress={(p) => setModal({type: 'editGames', data: { player: p }})}
                                                />
                                            ) : (
                                                <div key={slotIndex} className="player-slot min-h-[72px] bg-gray-900/50 rounded-lg" />
                                            )
                                        })}
                                   </div>
                                   <CourtTimer court={court} />
                                   <button 
                                       className={`w-full py-2 px-4 rounded-lg font-bold transition duration-300 flex-shrink-0 ${court && isAdmin ? 'bg-white hover:bg-gray-200 text-black' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}
                                       disabled={!court || !isAdmin}
                                       onClick={() => handleEndMatch(courtIndex)}
                                   >
                                       경기 종료
                                   </button>
                               </div>
                           ))}
                        </div>
                    </section>
                </div>
            </main>
        </div>
    );
}

// ===================================================================================
// 진입 페이지 컴포넌트
// ===================================================================================
function EntryPage({ onEnter }) {
    const [formData, setFormData] = useState({
        name: '',
        level: 'A조',
        gender: '남'
    });

    useEffect(() => {
        const savedUserId = sessionStorage.getItem('badminton-currentUser-id');
        if (savedUserId) {
             getDoc(doc(playersRef, savedUserId)).then(docSnap => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setFormData({ name: data.name, level: data.level, gender: data.gender });
                }
            });
        }
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onEnter(formData);
    };

    return (
        <div className="bg-black text-white min-h-screen flex items-center justify-center font-sans">
            <div className="bg-gray-800 p-8 rounded-lg shadow-lg w-full max-w-sm">
                <h1 className="text-3xl font-bold text-yellow-400 mb-6 text-center">Cockslighting</h1>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input type="text" name="name" placeholder="이름" value={formData.name} onChange={handleChange} className="w-full bg-gray-700 text-white p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400" required />
                    <select name="level" value={formData.level} onChange={handleChange} className="w-full bg-gray-700 text-white p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400">
                        <option>A조</option>
                        <option>B조</option>
                        <option>C조</option>
                        <option>D조</option>
                    </select>
                    <div className="flex justify-around text-lg">
                        <label><input type="radio" name="gender" value="남" checked={formData.gender === '남'} onChange={handleChange} className="mr-2" /> 남자</label>
                        <label><input type="radio" name="gender" value="여" checked={formData.gender === '여'} onChange={handleChange} className="mr-2" /> 여자</label>
                    </div>
                    <button type="submit" className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 rounded-lg transition duration-300">입장하기</button>
                </form>
            </div>
        </div>
    );
}

// ===================================================================================
// 모달 컴포넌트들
// ===================================================================================

function ConfirmationModal({ title, body, onConfirm, onCancel }) {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-sm text-center shadow-lg">
                <h3 className="text-xl font-bold text-white mb-4">{title}</h3>
                <p className="text-gray-300 mb-6">{body}</p>
                <div className="flex gap-4">
                    <button onClick={onCancel} className="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 rounded-lg transition-colors">취소</button>
                    <button onClick={onConfirm} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-lg transition-colors">확인</button>
                </div>
            </div>
        </div>
    );
}

function CourtSelectionModal({ courts, onSelect, onCancel }) {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-sm text-center shadow-lg">
                <h3 className="text-xl font-bold text-yellow-400 mb-4">코트 선택</h3>
                <p className="text-gray-300 mb-6">경기를 시작할 코트를 선택해주세요.</p>
                <div className="flex flex-col gap-3">
                    {courts.map(courtIdx => (
                        <button key={courtIdx} onClick={() => onSelect(courtIdx)} className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-2 rounded-lg transition-colors">
                            {courtIdx + 1}번 코트에서 시작
                        </button>
                    ))}
                </div>
                <button onClick={onCancel} className="mt-6 w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 rounded-lg transition-colors">취소</button>
            </div>
        </div>
    );
}

function EditGamesModal({ player, onSave, onCancel }) {
    const [count, setCount] = useState(player.gamesPlayed);

    return (
         <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-xs text-center shadow-lg">
                <h3 className="text-xl font-bold text-yellow-400 mb-4">{player.name} 경기 수 수정</h3>
                <div className="flex items-center justify-center gap-4 my-6">
                    <button onClick={() => setCount(c => Math.max(0, c - 1))} className="px-4 py-2 bg-gray-600 rounded-full text-2xl w-14 h-14 flex items-center justify-center">-</button>
                    <span className="text-4xl font-bold w-16 text-center text-white">{count}</span>
                    <button onClick={() => setCount(c => c + 1)} className="px-4 py-2 bg-gray-600 rounded-full text-2xl w-14 h-14 flex items-center justify-center">+</button>
                </div>
                <div className="flex gap-4">
                    <button onClick={onCancel} className="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 rounded-lg transition-colors">취소</button>
                    <button onClick={() => onSave(count)} className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-2 rounded-lg transition-colors">저장</button>
                </div>
            </div>
        </div>
    );
}

