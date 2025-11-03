import { ParticipantChangedDataPayload, ParticipantChangedMessagingTrigger } from '../triggers'
import { closeConversation } from './conversation-close'
import { getSalesforceClientWithBotpress } from '../client'
import { SFMessagingConfig } from '../definitions/schemas'
import { ROUTING_STATUS } from '../const'
import { parseEntryPayload } from '../utils'
import * as bp from '.botpress'

export const executeOnParticipantChanged = async ({
  messagingTrigger,
  conversation,
  ctx,
  client,
  logger,
}: {
  messagingTrigger: ParticipantChangedMessagingTrigger
  conversation: bp.AnyMessageProps['conversation']
  ctx: bp.Context
  client: bp.Client
  logger: bp.Logger
}) => {
  const entryPayload = parseEntryPayload<ParticipantChangedDataPayload>(
    messagingTrigger.data.conversationEntry.entryPayload
  )

  if (!entryPayload) {
    logger.forBot().error('Could not parse entry payload')
    return
  }

  for (const entry of entryPayload.entries) {
    const {
      displayName,
      participant: { role, subject },
    } = entry

    if (role !== 'Agent') {
      return
    }

    switch (entry.operation) {
      case 'remove':
        try {
          // Get the conversation state to access the access token
          const conversationState = await client.getState({
            type: 'conversation',
            id: conversation.id,
            name: 'messaging',
          })

          if (!conversationState?.state?.payload?.accessToken) {
            logger.forBot().warn('No access token found in conversation state')
            return
          }

          const salesforceClient = await getSalesforceClientWithBotpress({ client, ctx, conversation, logger })

          const routingStatus = await salesforceClient.getConversationRoutingStatus()

          if (routingStatus.routingStatus === ROUTING_STATUS.TRANSFER) {
  
            const transferMessage = (ctx.configuration as SFMessagingConfig).transferMessage

            logger.forBot().info('Agent removed due to transfer', {
              conversationId: conversation.id,
              routingStatus: routingStatus.routingStatus,
            })

            if (transferMessage?.trim()) {
              // Create a system user to send the transfer message
              const { user: systemUser } = await client.getOrCreateUser({
                name: 'System',
                tags: {
                  id: conversation.id,
                },
              })

              // Send transfer message to user
              await client.createMessage({
                tags: {},
                type: 'text',
                userId: systemUser?.id as string,
                conversationId: conversation.id,
                payload: {
                  text: transferMessage,
                },
              })
            }
            return
          }
        } catch (error) {
          // If we can't determine the routing status, fall back to the original behavior
          // This ensures backward compatibility and prevents conversations from getting stuck
          logger.forBot().warn('Failed to check routing status, proceeding with conversation close', error)
        }

        return
      case 'add':
        const { user } = await client.getOrCreateUser({
          name: displayName,
          tags: {
            id: subject,
          },
        })

        if (!user.name?.length) {
          await client.updateUser({
            ...user,
            name: displayName,
            tags: {
              id: subject,
            },
          })
        }

        await client.updateConversation({
          id: conversation.id,
          tags: {
            assignedAt: new Date().toISOString(),
            transportKey: conversation.tags.transportKey,
            id: conversation.tags.id,
            closedAt: conversation.tags.closedAt,
          },
        })

        await client.createEvent({
          type: 'hitlAssigned',
          conversationId: conversation.id,
          payload: {
            conversationId: conversation.id,
            userId: user.id,
          },
        })
        return
      default:
        break
    }
  }
}
