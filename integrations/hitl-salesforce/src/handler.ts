import { getSalesforceClientWithBotpress } from './client'
import { closeConversation, executeOnConversationClose, isConversationClosed } from './events/conversation-close'
import { executeOnConversationMessage } from './events/conversation-message'
import { executeOnParticipantChanged } from './events/participant-changed'
import type {
  CloseConversationMessagingTrigger,
  MessageMessagingTrigger,
  ParticipantChangedMessagingTrigger,
  TriggerPayload,
} from './triggers'
import { parseMessagesToProcess, processMissedEventsFromEntries } from './utils'
import { IntegrationProps } from '.botpress'

/**
 * Gets the last processed entry timestamp from conversation state
 */
const getLastProcessedTimestamp = async (client: any, conversationId: string): Promise<number | undefined> => {
  try {
    const { state } = await client.getState({
      type: 'conversation',
      id: conversationId,
      name: 'lastProcessedTimestamp',
    })
    return state.payload?.timestamp
  } catch {
    // State doesn't exist yet, return undefined
    return undefined
  }
}

/**
 * Updates the last processed entry timestamp in conversation state
 */
const updateLastProcessedTimestamp = async (client: any, conversationId: string, timestamp: number): Promise<void> => {
  try {
    await client.setState({
      type: 'conversation',
      id: conversationId,
      name: 'lastProcessedTimestamp',
      payload: { timestamp },
    })
  } catch (error) {
    console.warn('Failed to update last processed timestamp:', error)
  }
}

/**
 * Processes a single event using the appropriate handler
 */
const processEvent = async (eventTrigger: any, conversation: any, props: any): Promise<void> => {
  const { ctx, client, logger } = props

  switch (eventTrigger.event) {
    case 'CONVERSATION_MESSAGE':
      await executeOnConversationMessage({
        messagingTrigger: eventTrigger as MessageMessagingTrigger,
        conversation,
        ...props,
      })
      break
    case 'CONVERSATION_PARTICIPANT_CHANGED':
      await executeOnParticipantChanged({
        messagingTrigger: eventTrigger as ParticipantChangedMessagingTrigger,
        ctx,
        conversation,
        client,
        logger,
      })
      break
    case 'CONVERSATION_CLOSE_CONVERSATION':
      logger.forBot().warn('Got CONVERSATION_CLOSE_CONVERSATION')
      await executeOnConversationClose({
        messagingTrigger: eventTrigger as CloseConversationMessagingTrigger,
        ctx,
        conversation,
        client,
        logger,
      })
      break
    default:
      logger.forBot().warn('Got unhandled event: ' + eventTrigger.event)
  }
}

/**
 * Processes missed events when SSE connection is restored
 */
const processMissedEventsOnRestore = async (props: any, conversation: any): Promise<void> => {
  const { client, ctx, logger } = props
  
  try {

    const salesforceClient = await getSalesforceClientWithBotpress({ client, ctx, conversation, logger })
    const lastProcessedTimestamp = await getLastProcessedTimestamp(client, conversation.id)
    
    // Get conversation entries from Salesforce
    const entriesResponse = await salesforceClient.getConversationEntries(conversation.tags.id as string)
    const conversationEntries = entriesResponse.conversationEntries || []
    

    // Process missed events
    const missedEvents = processMissedEventsFromEntries(conversationEntries, lastProcessedTimestamp)
    
    if (missedEvents.length > 0) {
      logger.forBot().info('Found missed events to process', {
        conversationId: conversation.id,
        missedEventsCount: missedEvents.length,
        eventTypes: missedEvents.map(e => e.event),
      })

      let latestTimestamp = lastProcessedTimestamp || 0

      // Process each missed event using the shared event processor
      for (const missedEvent of missedEvents) {
        try {
          // Set the conversationId to match the current conversation
          missedEvent.data.conversationId = conversation.tags.id
          await processEvent(missedEvent, conversation, props)

          // Update latest timestamp
          if (missedEvent._originalTimestamp > latestTimestamp) {
            latestTimestamp = missedEvent._originalTimestamp
          }
        } catch (error) {
          logger.forBot().error('Failed to process missed event', {
            event: missedEvent.event,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      // Update the last processed timestamp
      if (latestTimestamp > (lastProcessedTimestamp || 0)) {
        await updateLastProcessedTimestamp(client, conversation.id, latestTimestamp)
      }
    }
  } catch (error) {
    logger.forBot().error('Failed to process missed events on restore', {
      conversationId: conversation.id,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export const handler: IntegrationProps['handler'] = async (props) => {
  const { req, ctx, client, logger } = props
  if (!req.body) {
    logger.forBot().warn('Handler received an empty body')
    return
  }

  const trigger = JSON.parse(req.body) as TriggerPayload

  logger.forBot().debug('Got Data on handler:', JSON.stringify(req.body))

  if (trigger.type === 'TRANSPORT_START' || (trigger.type === 'DATA' && !trigger.payload)) {
    logger
      .forBot()
      .debug(`Ignoring sf event of type: ${trigger.type} with definition ${JSON.stringify(trigger, null, 2)}`)
    return
  }

  const { conversation } = await client.getOrCreateConversation({
    channel: 'hitl',
    tags: {
      transportKey: trigger.transport.key,
    },
  })

  if (!conversation) {
    logger.forBot().warn(`No conversation for transport key ${trigger.transport.key}, ignoring event`)
    return
  }

  switch (trigger.type) {
    case 'DATA':
      const { payload: messagingTrigger } = trigger

      if (messagingTrigger.raw === 'Jwt is expired') {
        await closeConversation({ conversation, ctx, client, logger })
        return
      }

      // Parse messages to process using utility function
      const messagesToProcess = parseMessagesToProcess(messagingTrigger)
      
      // If no valid messages to process, return early
      if (messagesToProcess.length === 0) {
        return
      }

      let latestTimestamp = 0
      for (const messageTrigger of messagesToProcess) {
        await processEvent(messageTrigger, conversation, props)

        // Track timestamp for webhook events (these are never missed events)
        if (messageTrigger.data?.conversationEntry) {
          const eventTimestamp = messageTrigger.data.conversationEntry.transcriptedTimestamp || 0
          if (eventTimestamp > latestTimestamp) {
            latestTimestamp = eventTimestamp
          }
        }
      }

      // Update last processed timestamp for regular events
      if (latestTimestamp > 0) {
        await updateLastProcessedTimestamp(client, conversation.id, latestTimestamp)
      }
      return
    case 'ERROR':
      // If you start the sse session with debug enabled
      logger.forBot().debug('Got a debug error from the transport session: ' + JSON.stringify({ trigger }, null, 2))
      return
    case 'TRANSPORT_END':
      logger.forBot().warn('Got TRANSPORT_END')
      await closeConversation({ conversation, ctx, client, logger })
      return
    case 'TRANSPORT_RESTORED':
      if (isConversationClosed(conversation)) {
        // Restored transport from a conversation that is already closed, ending transport
        const salesforceClient = await getSalesforceClientWithBotpress({ client, ctx, conversation, logger })

        await salesforceClient.stopSSE(conversation.tags.transportKey as string)
      } else {
        // Process any missed events that occurred during the connection interruption
        await processMissedEventsOnRestore(props, conversation)
      }
      return

    default:
      logger.forBot().warn('Unsupported trigger type: ' + trigger.type)
      break
  }
}
