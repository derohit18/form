import React, { useState, useEffect } from 'react';
import { Search, Plus, Trash2, X, Move, Hand, LayoutGrid, Settings2 } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';

// --- FIREBASE INITIALIZATION ---
const firebaseConfig = {
  apiKey: "AIzaSyCFU4iXBjWSE9MM6Lamo2jx6NAmWyOSfjU",
  authDomain: "bob-shelf.firebaseapp.com",
  projectId: "bob-shelf",
  storageBucket: "bob-shelf.firebasestorage.app",
  messagingSenderId: "95605491366",
  appId: "1:95605491366:web:ec7ea3ace7640f277a5667"
};

// Initialize the Database Brain
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const branchId = 'bob-main-branch'; 

export default function App() {
  const [user, setUser] = useState(null);
  const [forms, setForms] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal & Spatial State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [targetPosition, setTargetPosition] = useState(null);
  const [editingForm, setEditingForm] = useState(null);
  const [formData, setFormData] = useState({ name: '' });

  // Drag & Drop / Mobile Selection State
  const [draggedFormId, setDraggedFormId] = useState(null);
  const [selectedFormId, setSelectedFormId] = useState(null);

  // --- AUTHENTICATION ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (err) {
        console.error("Auth Error:", err);
        setError("Authentication failed. Check your Firebase permissions.");
        setLoading(false);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // --- DATA FETCHING (With 5-Segment Path & Armored Sorting) ---
  useEffect(() => {
    if (!user) return;
    
    // Correct odd-number path: collection -> doc -> collection -> doc -> collection
    const collectionRef = collection(db, 'artifacts', branchId, 'public', 'data', 'shelf_forms');
    
    const unsubscribe = onSnapshot(
      collectionRef,
      (snapshot) => {
        const fetchedForms = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        // Armored sorting: Prevents crashes if a document has no 'name' field
        fetchedForms.sort((a, b) => {
          const nameA = typeof a.name === 'string' ? a.name : "";
          const nameB = typeof b.name === 'string' ? b.name : "";
          return nameA.localeCompare(nameB);
        });
        
        setForms(fetchedForms);
        setLoading(false);
      },
      (err) => {
        console.error("Firestore Error:", err);
        setError("Database connection failed. Check your Firebase Rules.");
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [user]);

  // --- MATRIX GENERATION LOGIC ---
  const highestPos = forms.length > 0 ? Math.max(...forms.map(f => f.position || 0)) : -1;
  const minimumCells = 6;
  const requiredCells = Math.max(minimumCells, Math.ceil((highestPos + 1) / 3) * 3 + 3);
  
  const gridCells = Array.from({ length: requiredCells }, () => []);
  forms.forEach(form => {
    if (form.position >= 0 && form.position < requiredCells) {
      gridCells[form.position].push(form);
    }
  });

  // --- INTERACTION HANDLERS ---
  const handleAddClick = (e, position) => {
    e.stopPropagation(); 
    if (selectedFormId) setSelectedFormId(null); 
    setTargetPosition(position);
    setFormData({ name: '' });
    setEditingForm(null);
    setIsModalOpen(true);
  };

  const handleEditClick = (e, form) => {
    e.stopPropagation(); 
    setFormData({ name: form.name });
    setEditingForm(form);
    setIsModalOpen(true);
    setSelectedFormId(null);
  };

  const handleCellTap = (position) => {
    if (selectedFormId) {
      moveForm(selectedFormId, position);
      setSelectedFormId(null);
    }
  };

  const handleFormMainBodyTap = (e, form) => {
    e.stopPropagation(); 
    if (selectedFormId === form.id) {
      setSelectedFormId(null);
    } else {
      setSelectedFormId(form.id);
    }
  };

  // --- SAVE & DELETE LOGIC (With 5-Segment Path) ---
  const handleSaveForm = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    try {
      const collectionRef = collection(db, 'artifacts', branchId, 'public', 'data', 'shelf_forms');
      if (editingForm) {
        const docRef = doc(db, 'artifacts', branchId, 'public', 'data', 'shelf_forms', editingForm.id);
        await updateDoc(docRef, { name: formData.name.trim(), updatedAt: new Date().toISOString() });
      } else {
        await addDoc(collectionRef, {
          name: formData.name.trim(),
          position: targetPosition,
          createdAt: new Date().toISOString()
        });
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error("Save Error:", err);
      alert("Failed to save data to Firebase.");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Remove this form from the shelf completely?")) return;
    try {
      const docRef = doc(db, 'artifacts', branchId, 'public', 'data', 'shelf_forms', id);
      await deleteDoc(docRef);
      setIsModalOpen(false); 
    } catch (err) {
      console.error("Delete Error:", err);
    }
  };

  // --- DRAG AND DROP LOGIC (With 5-Segment Path) ---
  const handleDragStart = (e, formId) => {
    e.stopPropagation();
    setDraggedFormId(formId);
    e.dataTransfer.effectAllowed = "move";
    setTimeout(() => setSelectedFormId(formId), 0);
  };

  const handleDragOver = (e) => {
    e.preventDefault(); 
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e, targetPos) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedFormId === null) return;
    
    const form = forms.find(f => f.id === draggedFormId);
    if (form && form.position !== targetPos) {
      moveForm(draggedFormId, targetPos);
    }
    
    setDraggedFormId(null);
    setSelectedFormId(null);
  };

  const moveForm = async (formId, targetPos) => {
    try {
      const docRef = doc(db, 'artifacts', branchId, 'public', 'data', 'shelf_forms', formId);
      await updateDoc(docRef, { position: targetPos });
    } catch (err) {
      console.error("Move Error:", err);
      alert("Failed to update spatial coordinates.");
    }
  };

  const checkSearchMatch = (form) => {
    if (!searchQuery) return true;
    return form.name.toLowerCase().includes(searchQuery.toLowerCase());
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] font-sans text-gray-800 pb-20 select-none">
      
      {/* HEADER */}
      <header className="bg-[#F47920] shadow-md sticky top-0 z-10 border-b-4 border-[#0055A5]">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-inner">
              <span className="text-[#F47920] font-black text-2xl tracking-tighter">B</span>
            </div>
            <div>
              <h1 className="text-white text-xl font-bold leading-tight uppercase tracking-wide">Bank of Baroda</h1>
              <p className="text-[#FFF0E5] text-xs font-semibold tracking-wider">Multi-Form Matrix for NBP</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-2 sm:px-4 py-6">
        
        {/* ERROR MESSAGE DISPLAY */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-700 font-bold text-sm">
            {error}
          </div>
        )}

        {/* SEARCH BOX */}
        <div className="relative mb-6 px-2">
          <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-[#0055A5]" />
          </div>
          <input
            type="text"
            className="block w-full pl-12 pr-4 py-4 border-2 border-[#0055A5] rounded-none font-bold text-gray-700 bg-white placeholder-[#0055A5]/50 focus:outline-none focus:ring-4 focus:ring-[#F47920]/30 transition-all uppercase text-sm tracking-wider shadow-sm"
            placeholder="[ HIGHLIGHT FORM ]"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* INSTRUCTIONS */}
        <div className="mb-4 text-center px-4">
          <div className="inline-flex items-center gap-2 bg-white px-3 py-1.5 rounded-full shadow-sm border border-gray-200">
            <Hand className="h-4 w-4 text-[#F47920]" />
            <p className="text-[10px] sm:text-xs font-bold text-gray-600 uppercase tracking-widest">
              Tap form text to Move | Tap ⚙️ to Edit
            </p>
          </div>
        </div>

        {/* LOADING STATE */}
        {loading && !error && (
          <div className="flex justify-center items-center py-12">
            <div className="animate-pulse text-[#0055A5] font-bold tracking-widest uppercase">Initializing Database...</div>
          </div>
        )}

        {/* THE PHYSICAL SHELF MATRIX */}
        {!loading && !error && (
          <div className="px-1 sm:px-2">
            <div className="border-4 border-[#2C3E50] bg-white shadow-xl relative overflow-hidden">
              
              <div className="grid grid-cols-3 relative z-10">
                {gridCells.map((cellForms, index) => {
                  
                  const isRightCol = index % 3 === 2;
                  const isBottomRow = index >= requiredCells - 3;
                  const isCellTargeted = selectedFormId && cellForms.every(f => f.id !== selectedFormId);

                  return (
                    <div 
                      key={`slot-${index}`}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, index)}
                      onClick={() => handleCellTap(index)}
                      className={`
                        min-h-[160px] flex flex-col relative transition-colors duration-200 p-1.5 sm:p-2
                        ${!isRightCol ? 'border-r-2 border-[#2C3E50]' : ''} 
                        ${!isBottomRow ? 'border-b-2 border-[#2C3E50]' : ''}
                        ${isCellTargeted ? 'bg-orange-50 cursor-pointer ring-inset ring-2 ring-[#F47920] z-20' : 'bg-white hover:bg-gray-50'}
                      `}
                    >
                      {/* Cell Header */}
                      <div className="flex justify-between items-center mb-2 px-1">
                        <span className="text-[9px] font-black text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-sm uppercase tracking-wider">
                          Slot {index + 1}
                        </span>
                        {isCellTargeted && <span className="text-[9px] font-bold text-[#F47920] animate-pulse">DROP HERE</span>}
                      </div>

                      {/* Form Stack Container */}
                      <div className="flex-grow flex flex-col gap-2 overflow-y-auto overflow-x-hidden no-scrollbar pb-8">
                        {cellForms.map(form => {
                          const isSelected = selectedFormId === form.id;
                          const isSearchMatch = checkSearchMatch(form);
                          const isDimmed = searchQuery && !isSearchMatch;

                          return (
                            <div
                              key={form.id}
                              className={`
                                flex flex-row items-stretch rounded shadow-sm border-l-4 transition-all relative group overflow-hidden
                                ${isSelected ? 'bg-blue-50 border-[#F47920] shadow-md ring-1 ring-[#F47920]' : 'bg-white border-[#0055A5] border'}
                                ${isDimmed ? 'opacity-20 grayscale' : 'opacity-100'}
                              `}
                            >
                              {/* Left Side: Drag Target */}
                              <div 
                                draggable
                                onDragStart={(e) => handleDragStart(e, form.id)}
                                onClick={(e) => handleFormMainBodyTap(e, form)}
                                className={`flex-grow p-1.5 sm:p-2 flex justify-between items-center gap-1 ${isSelected ? 'cursor-grabbing' : 'cursor-grab'}`}
                              >
                                <h3 className={`font-bold text-[10px] sm:text-xs leading-tight uppercase break-words
                                  ${isSelected ? 'text-[#F47920]' : 'text-[#0055A5]'}
                                `}>
                                  {form.name}
                                </h3>
                                {isSelected && <Move className="h-3 w-3 text-[#F47920] flex-shrink-0" />}
                              </div>

                              {/* Right Side: Edit Target */}
                              <button
                                onClick={(e) => handleEditClick(e, form)}
                                className={`
                                  flex items-center justify-center px-1.5 sm:px-2 border-l border-gray-200 
                                  hover:bg-[#0055A5] hover:text-white transition-colors
                                  ${isSelected ? 'text-[#F47920] border-[#F47920]' : 'text-gray-400'}
                                `}
                                aria-label="Edit Form"
                              >
                                <Settings2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      {/* Add Button */}
                      <div className="absolute bottom-1 left-1 right-1">
                        <button
                          onClick={(e) => handleAddClick(e, index)}
                          className={`w-full py-1.5 flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wider rounded
                            ${isCellTargeted ? 'opacity-0' : 'text-gray-400 bg-gray-50 hover:bg-[#0055A5] hover:text-white border border-dashed border-gray-300'}
                            transition-colors
                          `}
                        >
                          <Plus className="h-3 w-3" /> Add
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ADD/EDIT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2C3E50]/90 backdrop-blur-sm">
          <div className="bg-white border-4 border-[#0055A5] rounded-none shadow-2xl w-full max-w-md animate-in fade-in zoom-in duration-200">
            <div className="bg-[#0055A5] px-4 py-3 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <LayoutGrid className="h-4 w-4 text-white" />
                <h2 className="text-white font-bold tracking-widest uppercase text-sm">
                  {editingForm ? 'Manage Form' : `Slot #${targetPosition + 1} Entry`}
                </h2>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-white hover:text-red-300">
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <form onSubmit={handleSaveForm} className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-bold text-[#0055A5] uppercase tracking-wider mb-2">
                  Form Designation <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  className="w-full px-4 py-3 border-2 border-gray-300 font-bold focus:outline-none focus:border-[#F47920] transition-colors rounded-none text-lg"
                  placeholder="E.G., NEFT TRANSFER"
                  value={formData.name}
                  onChange={(e) => setFormData({name: e.target.value})}
                />
              </div>

              <div className="pt-2 flex flex-col sm:flex-row gap-3">
                <button
                  type="submit"
                  className="flex-1 py-4 bg-[#F47920] text-white font-black uppercase tracking-widest hover:bg-[#d86515] shadow-lg border-b-4 border-[#a64d10] active:border-b-0 active:translate-y-1 transition-all"
                >
                  {editingForm ? 'Save Changes' : 'Inject Form'}
                </button>
                
                {editingForm && (
                  <button
                    type="button"
                    onClick={() => handleDelete(editingForm.id)}
                    className="flex-1 py-4 bg-white text-red-600 border-2 border-red-200 font-black uppercase tracking-widest hover:bg-red-50 hover:border-red-600 shadow-sm transition-all flex justify-center items-center gap-2"
                  >
                    <Trash2 className="h-5 w-5" /> Delete
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
