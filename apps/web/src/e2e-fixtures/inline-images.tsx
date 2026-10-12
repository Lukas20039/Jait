import { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Message } from '@/components/chat/message'
import { PromptInput, type PromptInputHandle } from '@/components/chat/prompt-input'
import { ConfirmDialogProvider } from '@/components/ui/confirm-dialog'
import { TooltipProvider } from '@/components/ui/tooltip'
import { mergeAttachmentsIntoSegments } from '@/lib/message-segment-builders'
import { userMessageTextFromSegments, type UserMessageSegment } from '@/lib/user-message-segments'
import '@/index.css'

function Harness() {
  const [value, setValue] = useState('')
  const [segments, setSegments] = useState<UserMessageSegment[]>([])
  const [saved, setSaved] = useState<{ text: string; segments: UserMessageSegment[] } | null>(null)
  const [revision, setRevision] = useState(0)
  const ref = useRef<PromptInputHandle>(null)
  return <TooltipProvider><ConfirmDialogProvider>
    <main className="mx-auto max-w-xl space-y-6 p-4">
      <section data-testid="composer"><PromptInput ref={ref} value={value} segments={segments} onChange={text => {
        setValue(text)
        setSegments(ref.current?.getSegments() ?? [])
      }} onSubmit={(_files, attachments, nextSegments) => {
        const merged = mergeAttachmentsIntoSegments(nextSegments, attachments) ?? []
        setSaved({ text: userMessageTextFromSegments(merged), segments: merged })
        setValue('')
        setSegments([])
      }} /></section>
      {saved && <section data-testid="sent"><Message key={revision} role="user" content={saved.text} messageId="pasted-images" displayContent={saved.text} displaySegments={saved.segments} onEditMessage={async (_id, text, _index, _fromEnd, options) => {
        setSaved({ text, segments: options?.displaySegments ?? [] })
        return true
      }} /></section>}
      <button type="button" onClick={() => setRevision(n => n + 1)}>Reload saved message</button>
      <pre data-testid="saved-segments" className="hidden">{JSON.stringify(saved?.segments ?? [])}</pre>
    </main>
  </ConfirmDialogProvider></TooltipProvider>
}
const mount = document.createElement('div')
document.body.replaceChildren(mount)
createRoot(mount).render(<Harness />)
