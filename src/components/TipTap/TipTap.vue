<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Editor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { Undo, Redo, Bold, Italic, Strikethrough, Brain } from 'lucide-vue-next'
import { getGroqChatCompletion } from '@/composables/use-groq'

const editor = ref<Editor>()

onMounted(() => {
  editor.value = new Editor({
    editorProps: {
      attributes: {
        class: `prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none`,
      },
    },
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
    ],
    content:
      '<p>The significance of such figures in human progress has been debated. Some think they play a crucial role, while others say they have little impact on the broad currents of thought and social change. The concept is generally used in the sense that the person really existed in the past, as opposed to being legendary. However, the legends that can grow up around historical figures may be hard to distinguish from fact. Sources are often incomplete and may be inaccurate, particularly those from early periods of history. Without a body of personal documents, the more subtle aspects of personality of a historical figure can only be deduced. With historical figures who were also religious figures attempts to separate fact from belief may be controversial. In education, presenting information as if it were being told by a historical figure may give it greater impact. Since classical times, students have been asked to put themselves in the place of a historical figure as a way of bringing history to life. Historical figures are often represented in fiction, where fact and fancy are combined. In earlier traditions, before the rise of a critical historical tradition, authors took less care to be as accurate when describing what they knew of historical figures and their actions, interpolating imaginary elements intended to serve a moral purpose to events. More recently there has been a tendency once again for authors to freely depart from the "facts" when they conflict with their creative goals.</p>',
    // onUpdate: ({ editor }) => {
    //   console.log('onUpdate:', editor.getJSON())
    // },
    onBeforeCreate: ({ editor }) => {
      editorState.value.editor = editor as any
    },
  })
})

onBeforeUnmount(() => {
  editor.value?.destroy()
})

interface SelectionRange {
  from: number
  to: number
}
interface StreamingState {
  isStreaming: boolean
  error: string | null
  insertedLength: number
}
interface EditorState {
  editor: Editor | null
  selectionRange: SelectionRange | null
}

const state = ref<StreamingState>({
  isStreaming: false,
  error: null,
  insertedLength: 0,
})

const editorState = ref<EditorState>({
  editor: null,
  selectionRange: null,
})

const hasSelection = computed(() => {
  if (!editor.value) return false
  const { from, to } = editor.value.state.selection
  return from !== to
})

const getSelectedText = () => {
  if (!editor.value || !editorState.value.selectionRange) return ''
  const { from, to } = editorState.value.selectionRange
  return editor.value.state.doc.textBetween(from, to)
}

const replaceSelection = (newText: string): void => {
  if (!editor.value || !editorState.value.selectionRange) return

  try {
    const currentFrom = editorState.value.selectionRange.from
    const currentTo =
      editorState.value.selectionRange.from + state.value.insertedLength

    const tr = editor.value.state.tr.replaceWith(
      currentFrom,
      currentTo,
      editor.value.schema.text(newText),
    )

    editor.value.view.dispatch(tr)
    state.value.insertedLength = newText.length
  } catch (error) {
    state.value.error = 'Error replacing selection'
    console.error('Error replacing selection:', error)
  }
}

const createMessages = (selectedText: string) => {
  return [
    {
      role: 'system',
      content:
        'You are a helpful writing assistant. Summarize the given text while maintaining its core meaning. Keep your response focused and concise.',
    },
    {
      role: 'user',
      content: `Summarize this text: "${selectedText}"`,
    },
  ]
}

const summarize = async (): Promise<void> => {
  if (!hasSelection.value || state.value.isStreaming) return

  try {
    state.value.isStreaming = true
    state.value.error = null
    state.value.insertedLength = 0

    if (!editor.value) throw new Error('Editor is not initialized.')

    editorState.value.selectionRange = {
      from: editor.value.state.selection.from,
      to: editor.value.state.selection.to,
    }

    const selectedText = getSelectedText()
    if (!selectedText) throw new Error('No text selected.')

    const chatStream = await getGroqChatCompletion(createMessages(selectedText))

    let enhancedText = ''

    for await (const chunk of chatStream) {
      const content = chunk.choices[0]?.delta?.content || ''
      if (content) {
        enhancedText += content
        replaceSelection(enhancedText)
      }
    }
  } catch (error) {
    state.value.error =
      error instanceof Error ? error.message : 'An unknown error occurred'
    console.error('Error streaming:', error)
  } finally {
    state.value.isStreaming = false
    editorState.value.selectionRange = null
    state.value.insertedLength = 0
  }
}
</script>

<template>
  <div
    class="rounded-lg border border-secondaryWhite/10 bg-secondaryBlack p-4 py-0 text-primaryWhite shadow-xl shadow-primaryWhite/5"
  >
    <div id="tiptap-toolbar">
      <button
        @click="editor?.chain().toggleBold().run()"
        :class="{ active: editor?.isActive('bold') }"
      >
        <Bold />
      </button>
      <button
        @click="editor?.chain().toggleItalic().run()"
        :class="{ active: editor?.isActive('italic') }"
      >
        <Italic />
      </button>
      <button
        @click="editor?.chain().toggleStrike().run()"
        :class="{ active: editor?.isActive('strike') }"
      >
        <Strikethrough />
      </button>
      <button @click="editor?.chain().undo().run()"><Undo /></button>
      <button @click="editor?.chain().redo().run()"><Redo /></button>
      <button
        @click="summarize"
        class="btn-summarize"
        :class="{ 'opacity-60': state.isStreaming }"
        :disabled="state.isStreaming"
      >
        <Brain />
        <Transition name="fade" mode="out-in">
          <span v-if="state.isStreaming"> Loading... </span>
          <span v-else>Summarize</span>
        </Transition>
      </button>
    </div>
    <div class="p-4">
      <EditorContent :editor />
    </div>
  </div>
</template>

<style>
#tiptap-toolbar {
  @apply sticky top-0 z-40 flex w-full items-center gap-2 border-b border-secondaryWhite/10 bg-secondaryBlack py-2;
}
#tiptap-toolbar button {
  @apply inline-flex items-center gap-2.5 rounded-md p-2 text-sm text-primaryWhite duration-100;
}
#tiptap-toolbar button:hover {
  @apply bg-primaryWhite/5;
}
#tiptap-toolbar button:active {
  @apply scale-95 bg-primaryWhite/[0.025];
}
#tiptap-toolbar button svg {
  @apply h-5 w-5;
}
#tiptap-toolbar button.btn-summarize {
  background-size: 200%;
  background-position: center;
  @apply border border-secondaryWhite/10 bg-gradient-to-br from-blue via-blue to-secondaryWhite/15;
}
#tiptap-toolbar button.btn-summarize:hover {
  opacity: 0.85;
}
#tiptap-toolbar button.active {
  @apply !bg-blue !text-white;
}
/* .ProseMirror {
  @apply !outline-none;
} */

.fade-enter-active,
.fade-leave-active {
  @apply duration-200;
}

.fade-enter-from,
.fade-leave-to {
  @apply opacity-0;
}
</style>
