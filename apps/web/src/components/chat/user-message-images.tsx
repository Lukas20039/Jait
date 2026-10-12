import { ImageViewerContent } from './image-viewer'
import { Dialog, DialogTrigger } from '@/components/ui/dialog'
import type { UserImageAttachment } from '@/lib/user-message-segments'

function imageSource(image: UserImageAttachment): string {
  return image.data.startsWith('data:') ? image.data : `data:${image.mimeType};base64,${image.data}`
}
const sameImage = (a: UserImageAttachment, b: UserImageAttachment) =>
  a.name === b.name && a.mimeType === b.mimeType && a.data === b.data

/** Older messages may carry images only in the attachment list. */
export function UserMessageImages({ images, excluded = [] }: { images: UserImageAttachment[]; excluded?: UserImageAttachment[] }) {
  if (!images.some(image => !excluded.some(item => sameImage(item, image)))) return null
  return <div className="flex min-w-0 flex-wrap gap-1" data-user-message-images data-no-message-edit onClick={event => event.stopPropagation()}>
    {images.map((image, index) => excluded.some(item => sameImage(item, image)) ? null :
      <UserMessageImageReference key={index} image={image} number={index + 1} />)}
  </div>
}

export function UserMessageImageReference({ image, number }: { image: UserImageAttachment; number: number }) {
  return <Dialog>
    <DialogTrigger asChild>
      <button type="button" className="mx-0.5 inline-flex max-w-full items-center gap-1 rounded border border-border/70 bg-background/50 px-1 py-0.5 align-middle hover:bg-background focus-visible:ring-2 focus-visible:ring-ring" aria-label={`View image ${number}: ${image.name}`} title={image.name} data-image-reference={number} data-no-message-edit onClick={event => event.stopPropagation()}>
        <img src={imageSource(image)} alt="" className="h-[1em] w-[1em] shrink-0 rounded-sm object-contain" />
        <span className="min-w-0 max-w-[min(200px,40vw)] truncate">{image.name}</span>
        <span className="shrink-0 text-xs tabular-nums" data-image-number>[{number}]</span>
      </button>
    </DialogTrigger>
    <ImageViewerContent src={imageSource(image)} alt={image.name} />
  </Dialog>
}
