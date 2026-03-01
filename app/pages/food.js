import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { XMarkIcon, MagnifyingGlassIcon, CameraIcon, TrashIcon } from '@heroicons/react/24/outline';
import { food as foodApi } from '../lib/api';
import BottomNav from '../components/BottomNav';

const BarcodeScanner = dynamic(() => import('../components/BarcodeScanner'), {
  ssr: false
});

const MEAL_TYPES = [
  { id: 'breakfast', label: 'Breakfast', icon: '🌅' },
  { id: 'lunch', label: 'Lunch', icon: '☀️' },
  { id: 'dinner', label: 'Dinner', icon: '🌙' },
  { id: 'snack', label: 'Snack', icon: '🍿' }
];

const QUICK_PORTIONS = [50, 100, 150, 200];

function getDefaultMealType() {
  const hour = new Date().getHours();

  if (hour < 11) {
    return 'breakfast';
  }
  if (hour < 15) {
    return 'lunch';
  }
  if (hour < 20) {
    return 'dinner';
  }
  return 'snack';
}

function roundValue(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

function formatMacro(value) {
  return `${roundValue(value)}g`;
}

function buildLoggedFoodPayload(item, quantityG, mealType) {
  const quantity = Number(quantityG);

  return {
    food_id: item.id,
    source: item.source,
    name: item.name,
    brand: item.brand,
    quantity_g: quantity,
    meal_type: mealType,
    calories: roundValue(((item.calories_per_100g || 0) / 100) * quantity),
    protein: roundValue(((item.protein_per_100g || 0) / 100) * quantity),
    carbs: roundValue(((item.carbs_per_100g || 0) / 100) * quantity),
    fat: roundValue(((item.fat_per_100g || 0) / 100) * quantity),
    fibre: roundValue(((item.fibre_per_100g || 0) / 100) * quantity),
    logged_at: new Date().toISOString()
  };
}

function PortionSelector({
  item,
  mealType,
  quantityG,
  onQuantityChange,
  onConfirm,
  onCancel,
  saving
}) {
  const scaled = useMemo(() => buildLoggedFoodPayload(item, quantityG, mealType), [item, quantityG, mealType]);

  return (
    <div className="rounded-xl border border-cyan-500/30 bg-gray-900 p-4">
      <div className="mb-3">
        <h3 className="text-base font-semibold text-white">{item.name}</h3>
        <p className="text-sm text-gray-400">{item.brand || 'No brand listed'}</p>
      </div>

      <label className="mb-2 block text-sm font-medium uppercase tracking-wide text-gray-400">
        Portion Size (grams)
      </label>
      <input
        type="number"
        min="1"
        value={quantityG}
        onChange={(event) => onQuantityChange(event.target.value)}
        className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-base text-white focus:border-cyan-500 focus:outline-none"
      />

      <div className="mt-3 grid grid-cols-5 gap-2">
        {QUICK_PORTIONS.map((portion) => (
          <button
            key={portion}
            type="button"
            onClick={() => onQuantityChange(String(portion))}
            className={`min-h-11 rounded-lg px-2 py-2 text-sm font-medium transition-colors ${
              Number(quantityG) === portion
                ? 'bg-cyan-500 text-black'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {portion}g
          </button>
        ))}
        <button
          type="button"
          className="min-h-11 rounded-lg bg-gray-800 px-2 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700"
        >
          Custom
        </button>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2 rounded-xl bg-gray-800 p-3 text-center text-sm">
        <div>
          <div className="font-semibold text-white">{roundValue(scaled.calories)}</div>
          <div className="text-xs text-gray-400">kcal</div>
        </div>
        <div>
          <div className="font-semibold text-cyan-400">{formatMacro(scaled.protein)}</div>
          <div className="text-xs text-gray-400">Protein</div>
        </div>
        <div>
          <div className="font-semibold text-cyan-400">{formatMacro(scaled.carbs)}</div>
          <div className="text-xs text-gray-400">Carbs</div>
        </div>
        <div>
          <div className="font-semibold text-cyan-400">{formatMacro(scaled.fat)}</div>
          <div className="text-xs text-gray-400">Fat</div>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex min-h-14 flex-1 items-center justify-center rounded-xl border border-gray-700 bg-gray-800 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-700"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => onConfirm(scaled)}
          disabled={saving || !(Number(quantityG) > 0)}
          className="flex min-h-14 flex-1 items-center justify-center rounded-xl bg-cyan-500 py-3 text-sm font-semibold text-black transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Logging...' : `Log to ${MEAL_TYPES.find((meal) => meal.id === mealType)?.label}`}
        </button>
      </div>
    </div>
  );
}

export default function FoodPage() {
  const [activeMeal, setActiveMeal] = useState(getDefaultMealType);
  const [logs, setLogs] = useState([]);
  const [totals, setTotals] = useState({ calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [searchOpen, setSearchOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchError, setSearchError] = useState('');

  const [scannerError, setScannerError] = useState('');
  const [scannerLookupLoading, setScannerLookupLoading] = useState(false);
  const [scannerNotFound, setScannerNotFound] = useState(false);

  const [selectedFood, setSelectedFood] = useState(null);
  const [selectedSource, setSelectedSource] = useState(null);
  const [quantityG, setQuantityG] = useState('100');
  const [saving, setSaving] = useState(false);

  const today = useMemo(() => new Date().toISOString().split('T')[0], []);

  const groupedLogs = useMemo(() => {
    return MEAL_TYPES.reduce((acc, meal) => {
      acc[meal.id] = logs.filter((log) => log.meal_type === meal.id);
      return acc;
    }, {});
  }, [logs]);

  const activeMealLogs = groupedLogs[activeMeal] || [];

  useEffect(() => {
    loadTodayLogs();
  }, []);

  useEffect(() => {
    if (!searchOpen || selectedFood || searchQuery.trim().length < 2) {
      if (!searchQuery.trim()) {
        setSearchResults([]);
        setSearchError('');
      }
      return undefined;
    }

    const timeoutId = setTimeout(async () => {
      setSearchLoading(true);
      setSearchError('');

      try {
        const response = await foodApi.search(searchQuery.trim());
        setSearchResults(response.results || []);
      } catch (requestError) {
        setSearchResults([]);
        setSearchError(requestError.response?.data?.error || 'Search failed');
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchOpen, searchQuery, selectedFood]);

  const loadTodayLogs = async () => {
    try {
      setLoading(true);
      const response = await foodApi.getLogs(today);
      setLogs(response.logs || []);
      setTotals(response.totals || { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 });
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Failed to load food logs');
    } finally {
      setLoading(false);
    }
  };

  const resetSelection = () => {
    setSelectedFood(null);
    setSelectedSource(null);
    setQuantityG('100');
  };

  const closeSearchModal = () => {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
    setSearchError('');
    resetSelection();
  };

  const closeScannerModal = () => {
    setScannerOpen(false);
    setScannerError('');
    setScannerLookupLoading(false);
    setScannerNotFound(false);
    resetSelection();
  };

  const openSearchModal = () => {
    closeScannerModal();
    setSearchOpen(true);
  };

  const openScannerModal = () => {
    closeSearchModal();
    setScannerOpen(true);
    setSelectedSource('scanner');
  };

  const handleFoodChoice = (item, source) => {
    setSelectedFood(item);
    setSelectedSource(source);
    setQuantityG(item.serving_size_g ? String(Math.round(item.serving_size_g)) : '100');
  };

  const handleLogFood = async (payload) => {
    try {
      setSaving(true);
      await foodApi.log(payload);
      await loadTodayLogs();

      if (selectedSource === 'scanner') {
        closeScannerModal();
      } else {
        closeSearchModal();
      }
    } catch (requestError) {
      const message = requestError.response?.data?.error || 'Failed to log food';
      if (selectedSource === 'scanner') {
        setScannerError(message);
      } else {
        setSearchError(message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (logId) => {
    try {
      await foodApi.deleteLog(logId);
      await loadTodayLogs();
    } catch (requestError) {
      alert(requestError.response?.data?.error || 'Failed to delete food log');
    }
  };

  const handleBarcodeDetected = async (rawCode) => {
    const code = String(rawCode || '').trim();

    if (!code) {
      return;
    }

    setScannerLookupLoading(true);
    setScannerError('');
    setScannerNotFound(false);

    try {
      const item = await foodApi.lookupBarcode(code);
      handleFoodChoice(item, 'scanner');
    } catch (requestError) {
      if (requestError.response?.status === 404) {
        setScannerNotFound(true);
        return;
      }

      setScannerError(requestError.response?.data?.error || 'Barcode lookup failed');
    } finally {
      setScannerLookupLoading(false);
    }
  };

  const mealBreakdown = useMemo(() => {
    return MEAL_TYPES.map((meal) => ({
      ...meal,
      count: groupedLogs[meal.id]?.length || 0,
      calories: roundValue((groupedLogs[meal.id] || []).reduce((sum, item) => sum + (item.calories || 0), 0))
    }));
  }, [groupedLogs]);

  return (
    <div className="flex h-screen flex-col bg-gray-900 text-white">
      <header className="flex h-14 flex-shrink-0 items-center border-b border-gray-800 bg-gray-900">
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-4">
          <div>
            <h1 className="text-xl font-bold text-white">Food</h1>
            <p className="text-sm text-gray-400">Today, {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}</p>
          </div>
          <Link href="/" className="flex h-11 items-center rounded-xl border border-gray-700 bg-gray-800 px-3 text-sm font-medium text-cyan-400 transition-colors hover:bg-gray-700">
            Dashboard
          </Link>
        </div>
      </header>

      <main className="page-content mx-auto w-full max-w-md px-4 pb-36 pt-3">
        <div className="sticky top-0 z-20 -mx-4 border-b border-gray-800 bg-gray-900 px-4 pb-3">
          <div className="grid grid-cols-4 gap-2">
            {MEAL_TYPES.map((meal) => (
              <button
                key={meal.id}
                type="button"
                onClick={() => setActiveMeal(meal.id)}
                className={`flex min-h-12 flex-col items-center justify-center rounded-xl px-2 py-2 text-center text-sm font-medium transition-colors ${
                  activeMeal === meal.id
                    ? 'bg-cyan-500 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                <div className="text-lg">{meal.icon}</div>
                <div>{meal.label}</div>
              </button>
            ))}
          </div>

          <div className="mt-3 rounded-xl bg-gray-800 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-400">Daily Totals</h2>
              <span className="text-sm text-cyan-400">{today}</span>
            </div>
            <div className="grid grid-cols-4 gap-3 text-center">
              <div>
                <div className="text-xl font-bold text-white">{roundValue(totals.calories)}</div>
                <div className="text-xs text-gray-400">kcal</div>
              </div>
              <div>
                <div className="text-base font-semibold text-cyan-400">{formatMacro(totals.protein)}</div>
                <div className="text-xs text-gray-400">Protein</div>
              </div>
              <div>
                <div className="text-base font-semibold text-cyan-400">{formatMacro(totals.carbs)}</div>
                <div className="text-xs text-gray-400">Carbs</div>
              </div>
              <div>
                <div className="text-base font-semibold text-cyan-400">{formatMacro(totals.fat)}</div>
                <div className="text-xs text-gray-400">Fat</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-4 mt-4 rounded-xl bg-gray-800 p-4">
          <h2 className="mb-3 text-base font-semibold text-gray-400">Meal Breakdown</h2>
          <div className="grid grid-cols-2 gap-3">
            {mealBreakdown.map((meal) => (
              <button
                key={meal.id}
                type="button"
                onClick={() => setActiveMeal(meal.id)}
                className={`min-h-16 rounded-xl border p-3 text-left transition-colors ${
                  activeMeal === meal.id
                    ? 'border-cyan-500 bg-cyan-500/10'
                    : 'border-gray-700 bg-gray-900'
                }`}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">{meal.label}</span>
                  <span className="text-xs text-gray-400">{meal.count} item{meal.count === 1 ? '' : 's'}</span>
                </div>
                <div className="text-lg font-bold text-cyan-400">{meal.calories}</div>
                <div className="text-xs text-gray-400">kcal</div>
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4 rounded-xl bg-gray-800 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">
              {MEAL_TYPES.find((meal) => meal.id === activeMeal)?.label}
            </h2>
            <span className="text-xs uppercase tracking-wide text-gray-400">Today&apos;s log</span>
          </div>

          {loading ? (
            <p className="text-sm text-gray-400">Loading food log...</p>
          ) : error ? (
            <p className="text-sm text-red-400">{error}</p>
          ) : activeMealLogs.length === 0 ? (
            <p className="text-sm text-gray-400">No foods logged for this meal yet.</p>
          ) : (
            <div className="space-y-3">
              {activeMealLogs.map((log) => (
                <div key={log.id} className="min-h-16 rounded-xl border border-gray-700 bg-gray-900 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-base font-medium text-white">{log.name}</h3>
                      <p className="truncate text-sm text-gray-400">{log.brand || 'No brand listed'}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(log.id)}
                      className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
                      aria-label={`Delete ${log.name}`}
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-gray-400">{roundValue(log.quantity_g)}g</span>
                    <span className="font-semibold text-cyan-400">{roundValue(log.calories)} kcal</span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-sm text-gray-400">
                    <div className="rounded-lg bg-gray-800 px-2 py-2 text-center">P {formatMacro(log.protein)}</div>
                    <div className="rounded-lg bg-gray-800 px-2 py-2 text-center">C {formatMacro(log.carbs)}</div>
                    <div className="rounded-lg bg-gray-800 px-2 py-2 text-center">F {formatMacro(log.fat)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <div className="fixed bottom-[calc(64px+env(safe-area-inset-bottom))] left-0 right-0 z-20 border-t border-gray-800 bg-gray-900 p-3">
        <div className="mx-auto grid max-w-md grid-cols-3 gap-2">
          <button
            type="button"
            onClick={openSearchModal}
            className="flex min-h-14 flex-col items-center justify-center rounded-xl bg-gray-800 px-2 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700"
          >
            <MagnifyingGlassIcon className="h-5 w-5 text-cyan-400" />
            <span>Search</span>
          </button>
          <button
            type="button"
            onClick={openScannerModal}
            className="flex min-h-14 flex-col items-center justify-center rounded-xl bg-gray-800 px-2 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700"
          >
            <CameraIcon className="h-5 w-5 text-cyan-400" />
            <span>Scan Barcode</span>
          </button>
          <button
            type="button"
            onClick={openSearchModal}
            className="flex min-h-14 flex-col items-center justify-center rounded-xl bg-gray-800 px-2 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700"
          >
            <CameraIcon className="h-5 w-5 text-cyan-400" />
            <span>Scan Label</span>
          </button>
        </div>
      </div>

      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center" onClick={closeSearchModal}>
          <div className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-gray-700 bg-gray-800 p-4" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">{selectedFood ? 'Choose Portion' : 'Search Food'}</h2>
              <button type="button" onClick={closeSearchModal} className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-700 hover:text-white">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {selectedFood ? (
              <PortionSelector
                item={selectedFood}
                mealType={activeMeal}
                quantityG={quantityG}
                onQuantityChange={setQuantityG}
                onConfirm={handleLogFood}
                onCancel={resetSelection}
                saving={saving}
              />
            ) : (
              <>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search chicken breast, yogurt, oats..."
                  className="mb-4 w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-base text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none"
                />

                {searchLoading && <p className="text-sm text-gray-400">Searching...</p>}
                {searchError && <p className="mb-3 text-sm text-red-400">{searchError}</p>}

                <div className="max-h-80 space-y-2 overflow-y-auto">
                  {searchResults.map((item) => (
                    <button
                      key={`${item.source}-${item.id}`}
                      type="button"
                      onClick={() => handleFoodChoice(item, 'search')}
                      className="w-full rounded-xl border border-gray-700 bg-gray-900 p-3 text-left transition-colors hover:border-cyan-500/40 hover:bg-gray-800"
                    >
                      <div className="text-base font-semibold text-white">{item.name}</div>
                      <div className="mt-1 text-sm text-gray-400">{item.brand || 'No brand listed'}</div>
                      <div className="mt-2 text-xs text-cyan-400">
                        {item.calories_per_100g ?? 'N/A'} kcal / 100g
                      </div>
                    </button>
                  ))}
                  {!searchLoading && searchQuery.trim().length >= 2 && searchResults.length === 0 && !searchError && (
                    <p className="text-sm text-gray-400">No results found.</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {scannerOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center" onClick={closeScannerModal}>
          <div className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-gray-700 bg-gray-800 p-4" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">{selectedFood ? 'Confirm Portion' : 'Scan Barcode'}</h2>
              <button type="button" onClick={closeScannerModal} className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-700 hover:text-white">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {selectedFood ? (
              <PortionSelector
                item={selectedFood}
                mealType={activeMeal}
                quantityG={quantityG}
                onQuantityChange={setQuantityG}
                onConfirm={handleLogFood}
                onCancel={resetSelection}
                saving={saving}
              />
            ) : (
              <>
                <BarcodeScanner
                  active={scannerOpen && !selectedFood && !scannerLookupLoading}
                  onDetected={handleBarcodeDetected}
                  onError={() => setScannerError('Unable to access camera. Check browser permissions and HTTPS.')}
                />

                {scannerLookupLoading && <p className="mt-3 text-sm text-gray-400">Looking up product...</p>}
                {scannerError && <p className="mt-3 text-sm text-red-400">{scannerError}</p>}
                {scannerNotFound && (
                  <div className="mt-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3">
                    <p className="text-sm text-yellow-200">Product not found. Try searching by name instead.</p>
                    <button
                      type="button"
                      onClick={openSearchModal}
                      className="mt-3 min-h-11 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-cyan-400"
                    >
                      Search by name
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <BottomNav active="diary" />
    </div>
  );
}
