import { startHitl, stopHitl, createUser } from './hitl'
import { IntegrationProps } from '.botpress'

export default {
  startHitl,
  stopHitl,
  createUser,
} satisfies IntegrationProps['actions']
