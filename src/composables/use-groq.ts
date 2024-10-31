import Groq from 'groq-sdk'

const groq = new Groq({
  apiKey: import.meta.env.VITE_GROQ_API_KEY,
  dangerouslyAllowBrowser: true,
})

export const getGroqChatCompletion = async (messages: any) => {
  return await groq.chat.completions.create({
    messages,
    model: 'llama3-8b-8192',
    stream: true,
    temperature: 0.7,
    max_tokens: 1024,
  })
}
