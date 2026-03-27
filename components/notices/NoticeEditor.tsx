'use client'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import { Bold, Italic, List, ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils/cn'

interface NoticeEditorProps {
  content: string
  onChange: (html: string) => void
}

export function NoticeEditor({ content, onChange }: NoticeEditorProps) {
  const editor = useEditor({
    extensions: [StarterKit, Image.configure({ inline: true })],
    content,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  })

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !editor) return
    if (file.size > 10 * 1024 * 1024) { alert('10MB 이하 파일만 업로드 가능합니다.'); return }
    const supabase = createClient()
    const fileName = `${Date.now()}-${file.name}`
    const { data, error } = await supabase.storage.from('notice-images').upload(fileName, file)
    if (error) { alert('이미지 업로드 실패'); return }
    const { data: urlData } = supabase.storage.from('notice-images').getPublicUrl(data.path)
    editor.chain().focus().setImage({ src: urlData.publicUrl }).run()
  }

  if (!editor) return null

  return (
    <div className="border border-[#E5E7EB] rounded-lg overflow-hidden">
      <div className="flex items-center gap-1 p-2 border-b border-[#E5E7EB] bg-[#F9FAFB]">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={cn('p-1.5 rounded hover:bg-[#E5E7EB]', editor.isActive('bold') && 'bg-[#EFF6FF] text-[#2563EB]')}
        >
          <Bold className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={cn('p-1.5 rounded hover:bg-[#E5E7EB]', editor.isActive('italic') && 'bg-[#EFF6FF] text-[#2563EB]')}
        >
          <Italic className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={cn('p-1.5 rounded hover:bg-[#E5E7EB]', editor.isActive('bulletList') && 'bg-[#EFF6FF] text-[#2563EB]')}
        >
          <List className="h-4 w-4" />
        </button>
        <label className="p-1.5 rounded hover:bg-[#E5E7EB] cursor-pointer">
          <ImageIcon className="h-4 w-4" />
          <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
        </label>
      </div>
      <EditorContent
        editor={editor}
        className="min-h-[200px] p-3 text-sm prose prose-sm max-w-none focus-within:outline-none [&_.ProseMirror]:focus:outline-none [&_.ProseMirror]:min-h-[150px]"
      />
    </div>
  )
}
