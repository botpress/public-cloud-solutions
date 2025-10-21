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

/**
 * Processes conversation entries to identify and handle missed events
 * This function converts conversation entries into the same format as SSE events
 * so they can be processed by the existing event handlers
 * 
 * @param conversationEntries Array of conversation entries from Salesforce API
 * @param lastProcessedTimestamp Timestamp of the last processed entry (optional)
 * @returns Array of events that were missed and need to be processed
 */
export const processMissedEventsFromEntries = (
  conversationEntries: any[], 
  lastProcessedTimestamp?: number
): any[] => {
  const missedEvents: any[] = []

  if (!conversationEntries || conversationEntries.length === 0) {
    return missedEvents
  }

  // Sort entries by timestamp (oldest first) to process them in chronological order
  const sortedEntries = [...conversationEntries].sort((a, b) => 
    (a.transcriptedTimestamp || 0) - (b.transcriptedTimestamp || 0)
  )

  for (const entry of sortedEntries) {
    const entryTimestamp = entry.transcriptedTimestamp || 0
    
    // Skip entries that were already processed
    if (lastProcessedTimestamp && entryTimestamp <= lastProcessedTimestamp) {
      continue
    }

    // Convert entry to SSE-like event format
    const eventType = mapEntryTypeToEventType(entry.entryType)
    
    if (eventType) {
      const eventData = {
        // Add the missing fields to match EventData structure
        channelPlatformKey: 'salesforce',
        channelType: 'embedded_messaging',
        channelAddressIdentifier: '',
        conversationId: '', // This will be set by the handler
        conversationEntry: {
          entryType: entry.entryType,
          entryPayload: entry.entryPayload,
          sender: entry.sender,
          senderDisplayName: entry.senderDisplayName,
          identifier: entry.identifier,
          transcriptedTimestamp: entry.transcriptedTimestamp,
          clientTimestamp: entry.clientTimestamp,
          // Add missing fields with default values
          contextParamMap: {},
          visibilityStrategy: 'All',
          relatedRecords: [],
          clientDuration: 0,
        }
      }

      const missedEvent = {
        event: eventType,
        data: eventData,
        _originalTimestamp: entryTimestamp,
      }

      missedEvents.push(missedEvent)
    }
  }

  return missedEvents
}

/**
 * Maps Salesforce conversation entry types to our internal event types
 * 
 * @param entryType The entry type from Salesforce conversation entries
 * @returns The corresponding event type for our handlers, or null if not supported
 */
const mapEntryTypeToEventType = (entryType: string): string | null => {
  switch (entryType) {
    case 'ParticipantChanged':
      return 'CONVERSATION_PARTICIPANT_CHANGED'
    case 'Message':
      return 'CONVERSATION_MESSAGE'
    case 'ConversationClosed':
      return 'CONVERSATION_CLOSE_CONVERSATION'
    case 'RoutingResult':
      // RoutingResult entries are typically handled internally and don't need processing
      return null
    default:
      // Log unknown entry types for debugging
      console.warn(`Unknown conversation entry type: ${entryType}`)
      return null
  }
}
