'use client'
import { useState, useEffect, useCallback } from 'react'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus, GripVertical, Trash2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils/cn'
import type { Todo } from '@/types/app'

function SortableTodoItem({ todo, onToggle, onDelete }: { todo: Todo; onToggle: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: todo.id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('flex items-center gap-2 bg-white border border-[#E5E7EB] rounded-lg px-3 py-2.5 group', isDragging && 'opacity-50 shadow-lg')}
    >
      <span {...attributes} {...listeners} className="cursor-grab text-[#6B7280] opacity-0 group-hover:opacity-100">
        <GripVertical className="h-4 w-4" />
      </span>
      <button onClick={onToggle} className={cn('w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors', todo.is_done ? 'bg-[#10B981] border-[#10B981]' : 'border-[#E5E7EB] hover:border-[#2563EB]')}>
        {todo.is_done && <Check className="h-3 w-3 text-white" />}
      </button>
      <span className={cn('flex-1 text-sm', todo.is_done && 'line-through text-[#6B7280]')}>{todo.title}</span>
      {todo.due_date && <span className="text-xs text-[#6B7280]">{todo.due_date}</span>}
      <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 text-[#EF4444]">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}

export default function TodoPage() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [newTitle, setNewTitle] = useState('')
  const sensors = useSensors(useSensor(PointerSensor))

  const fetchTodos = useCallback(async () => {
    const res = await fetch('/api/todos')
    if (res.ok) setTodos(await res.json())
  }, [])

  useEffect(() => { fetchTodos() }, [fetchTodos])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    await fetch('/api/todos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: newTitle }) })
    setNewTitle('')
    fetchTodos()
  }

  const handleToggle = async (todo: Todo) => {
    await fetch(`/api/todos/${todo.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_done: !todo.is_done }) })
    fetchTodos()
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/todos/${id}`, { method: 'DELETE' })
    fetchTodos()
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = todos.findIndex(t => t.id === active.id)
    const newIndex = todos.findIndex(t => t.id === over.id)
    const reordered = arrayMove(todos, oldIndex, newIndex)
    setTodos(reordered)
    const items = reordered.map((t, i) => ({ id: t.id, sort_order: i }))
    await fetch('/api/todos/reorder', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) })
  }

  const pending = todos.filter(t => !t.is_done)
  const done = todos.filter(t => t.is_done)

  return (
    <div className="p-4 max-w-xl mx-auto">
      <h1 className="text-xl font-bold text-[#111827] mb-4">나의 TO-DO</h1>
      <form onSubmit={handleAdd} className="flex gap-2 mb-6">
        <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="할 일 추가..." />
        <Button type="submit" size="sm"><Plus className="h-4 w-4 mr-1" />추가</Button>
      </form>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={pending.map(t => t.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2 mb-6">
            {pending.length === 0 && <p className="text-sm text-[#6B7280] text-center py-4">미완료 항목이 없습니다 🎉</p>}
            {pending.map(todo => (
              <SortableTodoItem key={todo.id} todo={todo} onToggle={() => handleToggle(todo)} onDelete={() => handleDelete(todo.id)} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {done.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider mb-2">완료 ({done.length})</p>
          <div className="space-y-2 opacity-60">
            {done.map(todo => (
              <div key={todo.id} className="flex items-center gap-2 bg-white border border-[#E5E7EB] rounded-lg px-3 py-2.5">
                <button onClick={() => handleToggle(todo)} className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 bg-[#10B981] border-[#10B981]">
                  <Check className="h-3 w-3 text-white" />
                </button>
                <span className="flex-1 text-sm line-through text-[#6B7280]">{todo.title}</span>
                <button onClick={() => handleDelete(todo.id)} className="text-[#EF4444]">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
