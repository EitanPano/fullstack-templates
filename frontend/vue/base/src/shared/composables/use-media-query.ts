import { onScopeDispose, ref, type Ref } from 'vue'

// Whether a CSS media query matches, kept current as the viewport changes. Pure Vue: no store.
export function useMediaQuery(query: string): Ref<boolean> {
  const media = typeof matchMedia === 'function' ? matchMedia(query) : null
  const matches = ref(media?.matches ?? false)
  if (media) {
    const onChange = (event: MediaQueryListEvent) => {
      matches.value = event.matches
    }
    media.addEventListener('change', onChange)
    onScopeDispose(() => {
      media.removeEventListener('change', onChange)
    })
  }
  return matches
}
