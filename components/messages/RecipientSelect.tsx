'use client'
import { useState, useEffect, useRef } from 'react'
import { ChevronDown, Search, Users } from 'lucide-react'

export interface RecipientOption {
  type: 'user' | 'team'
  id: string
  name: string
  color?: string
}

interface Props {
  value: RecipientOption | null
  onChange: (v: RecipientOption | null) => void
  placeholder?: string
  placement?: 'top' | 'bottom'
}

export function RecipientSelect({ value, onChange, placeholder = '보낼 대상 선택...', placement = 'bottom' }: Props) {
  const [open,   setOpen]   = useState(false)
  const [search, setSearch] = useState('')
  const [users,  setUsers]  = useState<RecipientOption[]>([])
  const [teams,  setTeams]  = useState<RecipientOption[]>([])
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/profiles/list')
      .then(r => r.json())
      .then((d: any) => {
        setUsers((d.profiles ?? []).map((p: any): RecipientOption => ({
          type: 'user', id: p.id, name: p.full_name, color: p.color,
        })))
        setTeams((d.teams ?? []).map((t: any): RecipientOption => ({
          type: 'team', id: t.id, name: t.name,
        })))
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const q = search.trim()
  const filteredUsers = q ? users.filter(u => u.name.includes(q)) : users
  const filteredTeams = q ? teams.filter(t => t.name.includes(q)) : teams

  const select = (opt: RecipientOption) => { onChange(opt); setOpen(false); setSearch('') }

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm bg-white hover:bg-[#F9FAFB] transition-colors text-left min-h-[38px]"
      >
        {value ? (
          <span className="flex items-center gap-2 min-w-0 flex-1">
            {value.type === 'team' ? (
              <Users className="h-3.5 w-3.5 shrink-0 text-[#6B7280]" />
            ) : (
              <span className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: value.color ?? '#6B7280' }}>
                {value.name.charAt(0)}
              </span>
            )}
            <span className="truncate text-[#111827] text-xs">{value.name}</span>
            {value.type === 'team' && (
              <span className="text-[10px] text-[#6B7280] bg-[#F3F4F6] px-1.5 rounded shrink-0">팀</span>
            )}
          </span>
        ) : (
          <span className="text-[#9CA3AF] text-xs flex-1">{placeholder}</span>
        )}
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#9CA3AF]" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className={`absolute z-[60] left-0 right-0 bg-white border border-[#E5E7EB] rounded-xl shadow-lg flex flex-col ${placement === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'}`} style={{ maxHeight: '220px' }}>
          {/* Search */}
          <div className="p-2 border-b border-[#F3F4F6] shrink-0">
            <div className="flex items-center gap-1.5 rounded-lg bg-[#F9FAFB] px-2 py-1.5 border border-[#E5E7EB]">
              <Search className="h-3 w-3 text-[#9CA3AF] shrink-0" />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1 text-xs bg-transparent outline-none placeholder:text-[#9CA3AF]"
                placeholder="이름 검색..."
              />
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto">
            {filteredTeams.length > 0 && (
              <>
                <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider">팀</p>
                {filteredTeams.map(t => (
                  <button key={t.id} type="button" onClick={() => select(t)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-[#EFF6FF] transition-colors">
                    <Users className="h-3.5 w-3.5 text-[#6B7280] shrink-0" />
                    <span className="flex-1 text-left text-[#111827]">{t.name}</span>
                    <span className="text-[10px] text-[#6B7280] bg-[#F3F4F6] px-1.5 py-0.5 rounded">팀</span>
                  </button>
                ))}
              </>
            )}
            {filteredUsers.length > 0 && (
              <>
                <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider">사람</p>
                {filteredUsers.map(u => (
                  <button key={u.id} type="button" onClick={() => select(u)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-[#EFF6FF] transition-colors">
                    <span className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: u.color ?? '#6B7280' }}>
                      {u.name.charAt(0)}
                    </span>
                    <span className="text-left text-[#111827]">{u.name}</span>
                  </button>
                ))}
              </>
            )}
            {filteredTeams.length === 0 && filteredUsers.length === 0 && (
              <p className="text-xs text-[#9CA3AF] text-center py-6">검색 결과가 없습니다.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
