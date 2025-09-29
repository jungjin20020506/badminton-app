import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
    getFirestore, doc, getDoc, setDoc, onSnapshot, 
    collection, deleteDoc, updateDoc, writeBatch, runTransaction,
    addDoc, query, where, getDocs, serverTimestamp 
} from 'firebase/firestore';

// ===================================================================================
// Firebase 설정 (기존과 동일)
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
// 클럽 로비 및 생성 관련 컴포넌트
// ===================================================================================

function ClubLobby({ onClubSelect, onCreateClub }) {
    const [clubs, setClubs] = useState([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(null); // null or club object

    useEffect(() => {
        const clubsRef = collection(db, "clubs");
        const unsubscribe = onSnapshot(clubsRef, (snapshot) => {
            const clubsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setClubs(clubsData);
        });
        return () => unsubscribe();
    }, []);

    const handleClubClick = (club) => {
        setShowPasswordModal(club);
    };

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
                        <div key={club.id} onClick={() => handleClubClick(club)} className="bg-gray-700 p-4 rounded-lg flex justify-between items-center cursor-pointer hover:bg-gray-600 transition-colors">
                            <span className="font-bold">{club.name}</span>
                            <span className="text-xs text-gray-400">🔒 입장하기</span>
                        </div>
                    ))}
                </div>

                <button onClick={() => setShowCreateModal(true)} className="mt-6 w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 rounded-lg transition duration-300">
                    + 새 클럽 만들기
                </button>
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
        if (!name || !password || !adminName) {
            setError('모든 필드를 입력해주세요.');
            return;
        }
        await onCreate({ name, password, adminName });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-sm text-center shadow-lg">
                <h3 className="text-xl font-bold text-white mb-6">새 클럽 만들기</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="클럽 이름" className="w-full bg-gray-700 text-white p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400" />
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="비밀번호" className="w-full bg-gray-700 text-white p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400" />
                    <input type="text" value={adminName} onChange={e => setAdminName(e.target.value)} placeholder="초대 관리자 이름" className="w-full bg-gray-700 text-white p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400" />
                    {error && <p className="text-red-500 text-sm">{error}</p>}
                    <div className="flex gap-4 pt-2">
                        <button type="button" onClick={onCancel} className="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 rounded-lg transition-colors">취소</button>
                        <button type="submit" className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-2 rounded-lg transition-colors">생성</button>
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
        // 실제 앱에서는 비밀번호를 해싱하여 서버에서 검증해야 합니다.
        // 여기서는 클라이언트 측에서 간단히 비교합니다.
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
                <input 
                    type="password" 
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(false); }}
                    onKeyPress={(e) => e.key === 'Enter' && handleEnter()}
                    className={`w-full bg-gray-700 text-white p-3 rounded-lg focus:outline-none focus:ring-2 ${error ? 'ring-red-500' : 'focus:ring-yellow-400'}`}
                    autoFocus
                />
                 {error && <p className="text-red-500 text-sm mt-2">비밀번호가 틀렸습니다.</p>}
                <div className="flex gap-4 mt-6">
                    <button onClick={onCancel} className="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 rounded-lg transition-colors">취소</button>
                    <button onClick={handleEnter} className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-2 rounded-lg transition-colors">입장</button>
                </div>
            </div>
        </div>
    );
}


// ===================================================================================
// 경기 관리 메인 컴포넌트 (기존 App 컴포넌트의 역할)
// ===================================================================================

// 상수, Helper 함수, 자식 컴포넌트(PlayerCard, EmptySlot 등)는 이전 코드와 거의 동일하므로
// 지면 관계상 여기에 다시 포함하지 않았습니다. 실제 코드에서는 이 아래에 위치해야 합니다.
// (스크롤 압박을 줄이기 위해 생략)
// ... PlayerCard, EmptySlot, CourtTimer, WaitingListSection 등 모든 자식 컴포넌트 ...


function ClubSpace({ clubId, onLeaveClub, clubData }) {
    // 기존 App 컴포넌트의 모든 state와 로직이 여기에 들어옵니다.
    // Firestore 참조만 clubId를 사용하도록 변경됩니다.
    
    const playersRef = useMemo(() => collection(db, "clubs", clubId, "players"), [clubId]);
    const gameStateRef = useMemo(() => doc(db, "clubs", clubId, "gameState", "live"), [clubId]);

    const [players, setPlayers] = useState({});
    const [gameState, setGameState] = useState(null);
    const [currentUser, setCurrentUser] = useState(null);
    const [selectedPlayerIds, setSelectedPlayerIds] = useState([]);
    const [modal, setModal] = useState({ type: null, data: null });
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [authChecked, setAuthChecked] = useState(false);

    // ADMIN_NAMES는 이제 clubData에서 가져옵니다.
    const ADMIN_NAMES = useMemo(() => [clubData.adminName], [clubData]);

    // ... 기존 App.jsx의 모든 로직 (isAdmin, useEffect, useCallback 핸들러들) ...
    // ... 여기에 그대로 복사 ...
    // 중요: handleLogout 함수는 onLeaveClub()을 호출하도록 수정해야 합니다.
    
    const handleLogout = useCallback(() => {
        if (!currentUser) return;
        setModal({ type: 'confirm', data: { 
            title: '나가기', 
            body: '나가시면 대기 명단과 경기에서 완전히 제외됩니다. 정말 나가시겠습니까?',
            onConfirm: async () => {
                // ... (내부 로직은 기존과 동일) ...
                // 마지막에 로비로 돌아가는 함수 호출
                localStorage.removeItem(`badminton-currentUser-id-${clubId}`);
                setCurrentUser(null);
                setModal({ type: null, data: null });
                onLeaveClub(); // 로비로 돌아가기
            }
        }});
    }, [currentUser, /* ... other dependencies */]);


    // EntryPage 컴포넌트도 ClubSpace 내부에 위치하거나 props로 clubId를 받아야 합니다.
    if (!currentUser) {
        return <EntryPage onEnter={handleEnter} clubId={clubId} />;
    }

    // ... 나머지 렌더링 로직 ...
    return (
        <div className="bg-black text-white min-h-screen font-sans flex flex-col" style={{ minWidth: '320px' }}>
             <header className="flex-shrink-0 p-2 flex justify-between items-center bg-gray-900 sticky top-0 z-10">
                <h1 className="text-lg font-bold text-yellow-400">COCK STAR <span className="text-sm text-white font-normal ml-2">&gt; {clubData.name}</span></h1>
                {/* ... 나머지 헤더 내용 ... */}
                 <button onClick={onLeaveClub} className="text-gray-400 hover:text-white mr-3 text-xs">[클럽 목록으로]</button>
                 {/* ... */}
            </header>
            {/* ... 기존 App.jsx의 main 부분 ... */}
        </div>
    );
}


// ===================================================================================
// 최상위 App 컴포넌트 (라우터 역할)
// ===================================================================================
export default function App() {
    const [currentClubId, setCurrentClubId] = useState(null);
    const [clubData, setClubData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    
    useEffect(() => {
        // 페이지 로드 시 마지막으로 접속했던 클럽 정보가 있는지 확인
        const lastClubId = localStorage.getItem('badminton-last-club-id');
        if (lastClubId) {
            handleClubSelect(lastClubId);
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
                localStorage.removeItem('badminton-last-club-id');
            }
        } catch (error) {
            console.error("클럽 정보를 불러오는 데 실패했습니다:", error);
            alert("클럽 정보를 불러오는 데 실패했습니다.");
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleCreateClub = async ({ name, password, adminName }) => {
        setIsLoading(true);
        try {
            // Firestore에 클럽 정보 추가
            const clubRef = await addDoc(collection(db, "clubs"), {
                name,
                password, // 실제 앱에서는 반드시 해싱하여 저장해야 합니다.
                adminName,
                createdAt: serverTimestamp()
            });
            
            // 생성 후 바로 해당 클럽으로 이동
            handleClubSelect(clubRef.id);

        } catch (error) {
            console.error("클럽 생성에 실패했습니다:", error);
            alert("클럽 생성에 실패했습니다.");
        } finally {
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
        // ClubSpace 컴포넌트는 매우 크므로, 위에서 정의한 ClubSpace 함수와 그 자식 컴포넌트 전체를
        // 이 return 문 안에 렌더링해야 합니다.
        return <ClubSpace clubId={currentClubId} onLeaveClub={handleLeaveClub} clubData={clubData} />;
    } else {
        return <ClubLobby onClubSelect={handleClubSelect} onCreateClub={handleCreateClub} />;
    }
}
