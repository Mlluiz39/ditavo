type IconName = 'copy' | 'share' | 'folder' | 'save' | 'history' | 'pause' | 'play' | 'edit' | 'trash'
const paths: Record<IconName, string> = {
  copy: 'M9 9h11v11H9z M15 5V3H3v12h2',
  share: 'M8 12l8-5 M8 12l8 5 M8 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0 M20 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0 M20 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
  folder: 'M3 7V5h6l2 2h10v13H3V7Z M3 10h18',
  save: 'M4 3h13l3 3v15H4Z M8 3v6h8V3 M8 21v-8h8v8',
  history: 'M3 11a9 9 0 1 1 2 7 M3 4v7h7 M12 7v5l3 2',
  pause: 'M8 5v14 M16 5v14',
  play: 'M8 4l12 8-12 8Z',
  edit: 'M4 20l1-5L16 4l4 4L9 19l-5 1Z M13 7l4 4',
  trash: 'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',
}
export function Icon({ name }: { name: IconName }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}
