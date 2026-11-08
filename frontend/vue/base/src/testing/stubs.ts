/* eslint-disable vue/one-component-per-file -- this file is the shelf of small stubs */
import { defineComponent, h } from 'vue'
import { useI18n } from 'vue-i18n'

// Small components the specs route to or mount, so no spec defines more than one of its own.
export const Page = defineComponent({ render: () => h('h1', 'The page') })

export const Blank = defineComponent({ render: () => null })

export const Greeting = defineComponent({
  setup() {
    const { t } = useI18n()
    return () => h('p', t('app.skipToContent'))
  },
})
