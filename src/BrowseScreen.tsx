import { useState } from 'react';

const RECENT_SEARCHES = ['Easy', 'Quick', 'One Pan', 'Party'];

const POPULAR_FILTERS = ['Easy', 'Quick', 'One Pan', 'Party', 'Chicken'];

const ALL_FILTERS: { label: string; items: string[] }[] = [
  { label: 'Lifestyle',   items: ['Healthy', 'Vegan', 'Protein Packed', 'Party'] },
  { label: 'Difficulty',  items: ['Easy', 'Intermediate', 'Quick'] },
  { label: 'Protein',     items: ['Chicken', 'Pork', 'Beef', 'Egg', 'Fish'] },
  { label: 'Dish Type',   items: ['Soup', 'Stew', 'Stir-fried', 'Baked', 'Raw'] },
];

interface BrowseScreenProps {
  searchValue: string;
  setSearchValue: (v: string) => void;
  onSearch: () => void;
}

export default function BrowseScreen({ searchValue, setSearchValue, onSearch }: BrowseScreenProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(item: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(item) ? next.delete(item) : next.add(item);
      return next;
    });
  }

  function removeRecent(item: string) {
    // no-op for now, kept interactive
  }

  const chipBase: React.CSSProperties = {
    border: '1.5px solid #EAEAEA',
    backgroundColor: '#fff',
    color: '#6F6F6F',
  };
  const chipActive: React.CSSProperties = {
    border: '1.5px solid #F26B21',
    backgroundColor: '#FFF0E6',
    color: '#F26B21',
  };

  return (
    <div className="pb-24">
      {/* Title */}
      <div className="px-4 pt-6 pb-2 flex items-center justify-center">
        <h1 className="font-bold text-[24px]" style={{ color: '#1F1F1F' }}>Browse</h1>
      </div>

      {/* Search Bar */}
      <div className="px-4 mt-3 mb-8">
        <div
          className="flex items-center gap-3 px-4 h-12 rounded-[12px] border"
          style={{ backgroundColor: '#F9F9F9', borderColor: '#EAEAEA' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6F6F6F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            placeholder="Search recipes..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSearch()}
            className="flex-1 bg-transparent outline-none text-[16px] placeholder:text-[#6F6F6F]"
            style={{ color: '#1F1F1F' }}
          />
          {searchValue && (
            <button onClick={() => setSearchValue('')} className="text-[#6F6F6F]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Recently Searched */}
      <div className="px-4 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-[20px]" style={{ color: '#1F1F1F' }}>Recently Searched</h2>
          <button className="text-[14px] font-medium" style={{ color: '#F26B21' }}>Clear</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {RECENT_SEARCHES.map((item) => (
            <div
              key={item}
              className="flex items-center gap-1.5 pl-3.5 pr-2 py-1.5 rounded-full text-[14px] font-medium"
              style={{ backgroundColor: '#F9F9F9', border: '1.5px solid #EAEAEA', color: '#1F1F1F' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6F6F6F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="12 8 12 12 14 14"/><circle cx="12" cy="12" r="10"/>
              </svg>
              <span>{item}</span>
              <button
                onClick={() => removeRecent(item)}
                className="ml-0.5"
                style={{ color: '#6F6F6F' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Popular Filters */}
      <div className="px-4 mb-8">
        <h2 className="font-semibold text-[20px] mb-4" style={{ color: '#1F1F1F' }}>Popular Filters</h2>
        <div className="rounded-[16px] overflow-hidden border" style={{ borderColor: '#EAEAEA' }}>
          {POPULAR_FILTERS.map((item, i) => (
            <button
              key={item}
              onClick={() => toggle(item)}
              className="w-full flex items-center justify-between px-4 py-3.5 transition-colors text-left"
              style={{
                borderBottom: i < POPULAR_FILTERS.length - 1 ? '1px solid #EAEAEA' : undefined,
                backgroundColor: selected.has(item) ? '#FFF7F2' : '#fff',
              }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-semibold flex-shrink-0"
                  style={{
                    backgroundColor: selected.has(item) ? '#F26B21' : '#F5F5F5',
                    color: selected.has(item) ? '#fff' : '#6F6F6F',
                  }}
                >
                  {i + 1}
                </span>
                <span className="text-[16px]" style={{ color: selected.has(item) ? '#F26B21' : '#1F1F1F' }}>{item}</span>
              </div>
              {selected.has(item) && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F26B21" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* All Filters */}
      <div className="px-4">
        <h2 className="font-semibold text-[20px] mb-4" style={{ color: '#1F1F1F' }}>All Filters</h2>
        <div className="space-y-6">
          {ALL_FILTERS.map(({ label, items }) => (
            <div key={label}>
              <p className="font-semibold text-[15px] mb-3" style={{ color: '#1F1F1F' }}>{label}</p>
              <div className="flex flex-wrap gap-2">
                {items.map((item) => (
                  <button
                    key={item}
                    onClick={() => toggle(item)}
                    className="px-3.5 py-1.5 rounded-full text-[14px] font-medium transition-colors"
                    style={selected.has(item) ? chipActive : chipBase}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Active filter summary */}
      {selected.size > 0 && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 w-[calc(100%-32px)] max-w-sm z-40">
          <button
            className="w-full h-12 rounded-[12px] font-semibold text-[16px] text-white flex items-center justify-center gap-2 shadow-lg"
            style={{ backgroundColor: '#F26B21' }}
            onClick={() => setSelected(new Set())}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/>
            </svg>
            Apply {selected.size} Filter{selected.size > 1 ? 's' : ''}
          </button>
        </div>
      )}
    </div>
  );
}
