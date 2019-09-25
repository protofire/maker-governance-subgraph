import { log } from '@graphprotocol/graph-ts'

import { PollCreated } from '../../generated/PollingEmitter/PollingEmitter'
import { Action, Poll } from '../../generated/schema'

import {
  BIGINT_ONE,
  getGovernanceInfoEntity,
  updateGovernanceInfoEntity,
} from '../helpers'

export function handlePollCreated(event: PollCreated): void {
  let poll = new Poll(event.transaction.hash.toHex() + '-' + event.logIndex.toString())

  poll.creator = event.params.creator
  poll.blockCreated = event.params.blockCreated
  poll.pollId = event.params.pollId
  poll.startDate = event.params.startDate
  poll.endDate = event.params.endDate
  poll.multiHash = event.params.multiHash
  poll.url = event.params.url

  poll.save()

  let action = new Action(
    'POLL_CREATED' +
      '-' +
      event.transaction.hash.toHex() +
      '-' +
      event.logIndex.toString(),
  )
  action.type = 'POLL_CREATED'
  action.sender = event.transaction.from
  action.transactionHash = event.transaction.hash
  action.timestamp = event.block.timestamp
  action.save()

  let governanceInfo = getGovernanceInfoEntity()
  governanceInfo.countPolls = governanceInfo.countPolls.plus(BIGINT_ONE)

  updateGovernanceInfoEntity(event.block, governanceInfo)
}
