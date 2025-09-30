import axios from 'axios'
import * as bp from '../.botpress'

export const getIdForSubject = (subject: string, conversation: bp.AnyMessageProps['conversation']): string => {
  return `${subject}::${conversation.tags.id}`
}

export const forceCloseConversation = async (
  ctx: bp.AnyMessageProps['ctx'],
  conversation: bp.AnyMessageProps['conversation'],
) => {
  void axios.post(process.env.BP_WEBHOOK_URL + '/' + ctx.webhookId, {
    type: 'INTERNAL_FORCE_CLOSE_CONVERSATION',
    transport: {
      key: conversation.tags.transportKey,
    },
  })

  // We need to keep the process running for a little bit more, otherwise the lambda will not do the call above
  await new Promise((resolve) => setTimeout(resolve, 1000))
}

export const getFileExtensionFromUrl = (fileUrl: string): string => {
  const url = new URL(fileUrl.trim())
  return url.pathname.includes('.') ? (url.pathname.split('.').pop()?.toLowerCase() ?? '') : ''
}

export const parseMessagesToProcess = (messagingTrigger: any): any[] => {
  const messagesToProcess: any[] = []

  // Check if raw contains SSE messages (either multiple or single)
  if (messagingTrigger.raw && (messagingTrigger.raw.includes('\n\nid:') || messagingTrigger.raw.includes('\\nevent:'))) {
    // Parse SSE messages from raw field
    // Handle both \n\n and \n separators
    const sseMessages = messagingTrigger.raw.includes('\n\nid:') 
      ? messagingTrigger.raw.split('\n\n').filter((msg: string) => msg.trim())
      : [messagingTrigger.raw.replace(/\\n/g, '\n')] // Convert escaped newlines to real newlines
    
    for (const sseMessage of sseMessages) {
      const lines = sseMessage.split('\n')
      const eventLine = lines.find((line: string) => line.startsWith('event:'))
      const dataLine = lines.find((line: string) => line.startsWith('data:'))
      
      if (dataLine) {
        const messageData = dataLine.substring(5) // Remove 'data:' prefix
        const eventType = eventLine ? eventLine.substring(6) : 'CONVERSATION_MESSAGE' // Remove 'event:' prefix, default to CONVERSATION_MESSAGE
        
        try {
          const parsedData = JSON.parse(messageData)
          const singleMessageTrigger = {
            ...messagingTrigger,
            data: parsedData,
            event: eventType
          }
          messagesToProcess.push(singleMessageTrigger)
        } catch (e) {
          // Log error but continue processing other messages
          console.warn('Failed to parse individual SSE message', e)
        }
      }
    }
  } else {
    // Single message - parse and add to array
    try {
      messagingTrigger.data = JSON.parse(messagingTrigger?.data)
      messagesToProcess.push(messagingTrigger)
    } catch {
      // Return empty array for non-json data
      return []
    }
  }

  return messagesToProcess
}
