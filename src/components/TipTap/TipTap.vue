<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Editor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { Undo, Redo, Bold, Italic, Strikethrough, Brain } from 'lucide-vue-next'
import { getGroqChatCompletion } from '@/composables/use-groq'
import { TransitionGroup } from 'vue'
import { Loader2 } from 'lucide-vue-next'

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

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const chatMessages = ref<ChatMessage[]>([])
const newMessage = ref('')
const isChatLoading = ref(false)

const sendMessage = async (text: string, selectedText: string = '') => {
  if (!text.trim()) return
  
  try {
    isChatLoading.value = true
    chatMessages.value.push({ role: 'user', content: text })
    
    // Get editor context
    const editorContent = editor.value?.getHTML() || ''
    const currentSelection = selectedText || getSelectedText()
    
    const messages = [
      {
        role: 'system',
        content: `You are a helpful writing assistant. You have access to the following context:
          ${currentSelection ? '- Selected text: "' + currentSelection + '"' : ''}
          - Full document: "${editorContent}"
          
          Help the user with their writing by providing specific, contextual answers.
          When referring to text, you can quote relevant parts to make your answers clearer.`,
      },
      {
        role: 'user',
        content: text,
      },
    ]

    const chatStream = await getGroqChatCompletion(messages)
    let response = ''

    for await (const chunk of chatStream) {
      const content = chunk.choices[0]?.delta?.content || ''
      if (content) {
        response += content
      }
    }

    chatMessages.value.push({ role: 'assistant', content: response })
  } catch (error) {
    console.error('Chat error:', error)
  } finally {
    isChatLoading.value = false
    newMessage.value = ''
  }
}

// Add some helpful quick prompts for the chat
const quickPrompts = [
  'What\'s the main idea of this text?',
  'How can I make this clearer?',
  'Suggest a better conclusion',
  'Check for consistency',
]

const quickActions = [
  { 
    label: 'Summarize', 
    handler: async () => {
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

        const messages = [
          {
            role: 'system',
            content: 'You are a helpful writing assistant. Summarize the given text while maintaining its core meaning. Keep your response focused and concise.',
          },
          {
            role: 'user',
            content: `Summarize this text: "${selectedText}"`,
          },
        ]

        const chatStream = await getGroqChatCompletion(messages)
        let enhancedText = ''

        for await (const chunk of chatStream) {
          const content = chunk.choices[0]?.delta?.content || ''
          if (content) {
            enhancedText += content
            replaceSelection(enhancedText)
          }
        }
      } catch (error) {
        state.value.error = error instanceof Error ? error.message : 'An unknown error occurred'
        console.error('Error streaming:', error)
      } finally {
        state.value.isStreaming = false
        editorState.value.selectionRange = null
        state.value.insertedLength = 0
      }
    }
  },
  { 
    label: 'Improve',
    handler: async () => {
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

        const messages = [
          {
            role: 'system',
            content: 'You are a helpful writing assistant. Improve the given text while maintaining its core meaning. Make it more clear, concise, and engaging.',
          },
          {
            role: 'user',
            content: `Improve this text: "${selectedText}"`,
          },
        ]

        const chatStream = await getGroqChatCompletion(messages)
        let enhancedText = ''

        for await (const chunk of chatStream) {
          const content = chunk.choices[0]?.delta?.content || ''
          if (content) {
            enhancedText += content
            replaceSelection(enhancedText)
          }
        }
      } catch (error) {
        state.value.error = error instanceof Error ? error.message : 'An unknown error occurred'
        console.error('Error streaming:', error)
      } finally {
        state.value.isStreaming = false
        editorState.value.selectionRange = null
        state.value.insertedLength = 0
      }
    }
  },
  { 
    label: 'Complete',
    handler: async () => {
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

        const messages = [
          {
            role: 'system',
            content: 'You are a helpful writing assistant. Complete the given text in a natural and coherent way that follows from the existing content.',
          },
          {
            role: 'user',
            content: `Complete this text naturally: "${selectedText}"`,
          },
        ]

        const chatStream = await getGroqChatCompletion(messages)
        let enhancedText = ''

        for await (const chunk of chatStream) {
          const content = chunk.choices[0]?.delta?.content || ''
          if (content) {
            enhancedText += content
            replaceSelection(enhancedText)
          }
        }
      } catch (error) {
        state.value.error = error instanceof Error ? error.message : 'An unknown error occurred'
        console.error('Error streaming:', error)
      } finally {
        state.value.isStreaming = false
        editorState.value.selectionRange = null
        state.value.insertedLength = 0
      }
    }
  }
]

const handleQuickAction = (prompt: string) => {
  if (!hasSelection.value) return
  const selectedText = getSelectedText()
  sendMessage(prompt, selectedText)
}
</script>

<template>
  <div class="flex gap-4">
    <!-- Editor Column -->
    <div class="w-1/2 rounded-lg border border-secondaryWhite/10 bg-secondaryBlack/50 p-0 text-primaryWhite shadow-xl shadow-primaryWhite/5 backdrop-blur-sm transition-all duration-200">
      <div id="tiptap-toolbar" class="group">
        <div class="flex gap-2">
          <button
            v-for="action in quickActions"
            :key="action.label"
            @click="action.handler"
            class="btn-action group relative"
            :disabled="!hasSelection || state.isStreaming"
          >
            <div class="relative z-10 flex items-center gap-2">
              <Brain class="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
              {{ action.label }}
              <Loader2 
                v-if="state.isStreaming" 
                class="ml-2 h-4 w-4 animate-spin"
              />
            </div>
            <div class="absolute inset-0 -z-0 rounded-md bg-gradient-to-br from-blue/80 via-blue to-secondaryWhite/20 opacity-0 blur transition-opacity duration-200 group-hover:opacity-100" />
          </button>
        </div>
      </div>
      
      <div class="relative p-4">
        <div 
          v-if="state.isStreaming" 
          class="absolute inset-0 z-10 flex items-center justify-center bg-secondaryBlack/50 backdrop-blur-sm"
        >
          <div class="flex items-center gap-2 rounded-lg bg-blue/10 px-4 py-2">
            <Loader2 class="h-4 w-4 animate-spin" />
            <span>Processing...</span>
          </div>
        </div>
        <EditorContent :editor="editor" class="editor-content" />
      </div>
    </div>

    <!-- Chat Column -->
    <div class="w-1/2 rounded-lg border border-secondaryWhite/10 bg-secondaryBlack/50 p-4 text-primaryWhite shadow-xl shadow-primaryWhite/5 backdrop-blur-sm transition-all duration-200">
      <div class="flex h-full flex-col">
        <!-- Context Indicator -->
        <div class="mb-4 overflow-hidden rounded-lg bg-secondaryWhite/5 p-3 text-sm text-secondaryWhite/70">
          <transition name="slide" mode="out-in">
            <p v-if="hasSelection" :key="'selection'">
              <span class="font-medium text-blue">Selected text:</span> 
              {{ getSelectedText().slice(0, 50) }}{{ getSelectedText().length > 50 ? '...' : '' }}
            </p>
            <p v-else :key="'full'">
              <span class="font-medium text-blue">Full document</span> context enabled
            </p>
          </transition>
        </div>

        <!-- Quick Prompts -->
        <div class="mb-4 flex flex-wrap gap-2">
          <button
            v-for="prompt in quickPrompts"
            :key="prompt"
            @click="sendMessage(prompt)"
            class="quick-prompt-btn"
          >
            {{ prompt }}
          </button>
        </div>

        <!-- Chat Messages -->
        <div class="flex-1 space-y-4 overflow-y-auto px-2">
          <TransitionGroup 
            name="message" 
            tag="div" 
            class="space-y-4"
          >
            <div
              v-for="(message, index) in chatMessages"
              :key="index"
              :class="[
                'message rounded-lg p-3 transition-all duration-300',
                message.role === 'user'
                  ? 'user-message ml-auto max-w-[80%]'
                  : 'assistant-message max-w-[80%]'
              ]"
            >
              <p class="whitespace-pre-wrap">{{ message.content }}</p>
            </div>
          </TransitionGroup>
        </div>

        <!-- Chat Input -->
        <div class="mt-4">
          <div class="relative flex gap-2">
            <input
              v-model="newMessage"
              type="text"
              :placeholder="hasSelection ? 'Ask about the selected text...' : 'Ask about your document...'"
              class="chat-input"
              :disabled="isChatLoading"
              @keyup.enter="sendMessage(newMessage)"
            />
            <button
              @click="sendMessage(newMessage)"
              class="btn-action relative"
              :disabled="isChatLoading"
            >
              <div class="relative z-10 flex items-center gap-2">
                <span v-if="isChatLoading">
                  <Loader2 class="h-4 w-4 animate-spin" />
                </span>
                <span v-else>Send</span>
              </div>
              <div class="absolute inset-0 -z-0 rounded-md bg-gradient-to-br from-blue/80 via-blue to-secondaryWhite/20 opacity-0 blur transition-opacity duration-200 group-hover:opacity-100" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
#tiptap-toolbar {
  @apply sticky top-0 z-40 flex w-full items-center gap-2 px-4 border-b border-secondaryWhite/10 bg-secondaryBlack py-2;
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

/* Add these new styles */
.overflow-y-auto {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.1) transparent;
}

.overflow-y-auto::-webkit-scrollbar {
  width: 6px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: transparent;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background-color: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

/* Enhanced and new styles */
.editor-content {
  @apply mx-auto text-primaryWhite/90;
}

.editor-content p {
  @apply mb-4 leading-relaxed;
}

.editor-content h1 {
  @apply mb-6 text-3xl font-bold text-primaryWhite;
}

.editor-content h2 {
  @apply mb-4 text-2xl font-bold text-primaryWhite;
}

.editor-content h3 {
  @apply mb-3 text-xl font-bold text-primaryWhite;
}

.editor-content strong {
  @apply font-bold text-blue;
}

.editor-content em {
  @apply text-secondaryWhite/80;
}

.editor-content ul {
  @apply mb-4 list-disc pl-5;
}

.editor-content ol {
  @apply mb-4 list-decimal pl-5;
}

.editor-content li {
  @apply mb-2;
}

.editor-content blockquote {
  @apply border-l-4 border-blue/50 pl-4 italic text-secondaryWhite/70;
}

.editor-content code {
  @apply rounded bg-secondaryWhite/10 px-1.5 py-0.5 font-mono text-sm text-blue;
}

.editor-content pre {
  @apply mb-4 rounded-lg bg-secondaryWhite/5 p-4;
}

.editor-content pre code {
  @apply block bg-transparent p-0 text-primaryWhite;
}

.editor-content a {
  @apply text-blue underline decoration-blue/30 transition-colors hover:decoration-blue;
}

.btn-action {
  @apply relative inline-flex items-center gap-2 rounded-md border border-secondaryWhite/10 bg-gradient-to-br from-blue/80 via-blue to-secondaryWhite/20 px-3 py-2 text-sm text-primaryWhite transition-all duration-200;
}

.btn-action:hover:not(:disabled) {
  @apply -translate-y-0.5 shadow-lg shadow-blue/20;
}

.btn-action:disabled {
  @apply cursor-not-allowed opacity-50;
}

.quick-prompt-btn {
  @apply rounded-full border border-secondaryWhite/10 bg-secondaryWhite/5 px-3 py-1 text-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-secondaryWhite/10 hover:shadow-lg hover:shadow-white/5;
}

.chat-input {
  @apply flex-1 rounded-lg border border-secondaryWhite/10 bg-secondaryBlack/50 p-2 text-primaryWhite backdrop-blur-sm transition-all duration-200 focus:border-blue/50 focus:outline-none focus:ring-2 focus:ring-blue/20;
}

/* Message animations */
.message-enter-active,
.message-leave-active {
  transition: all 0.3s ease;
}

.message-enter-from {
  opacity: 0;
  transform: translateY(20px);
}

.message-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}

/* Slide transition */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s ease;
}

.slide-enter-from {
  opacity: 0;
  transform: translateX(20px);
}

.slide-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

/* Message styling */
.user-message {
  @apply bg-blue/10 animate-fadeIn;
}

.assistant-message {
  @apply bg-secondaryWhite/5 animate-fadeIn;
}

/* Custom animations */
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fadeIn {
  animation: fadeIn 0.3s ease-out forwards;
}
</style>
