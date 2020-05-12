import { log, store } from '@graphprotocol/graph-ts'

import {
  PollCreated,
  PollWithdrawn,
  Voted,
} from '../../generated/PollingEmitter/PollingEmitter'
import {
  Action,
  CreatePollAction,
  Poll,
  PollVote,
  VotePollAction,
  WithdrawPollAction,
} from '../../generated/schema'

import {
  BIGINT_ONE,
  BIGINT_ZERO,
  getGovernanceInfoEntity,
  updateGovernanceInfoEntity,
  msToSecondstime,
} from '../helpers'

export function handlePollCreated(event: PollCreated): void {
  let poll = new Poll(event.params.pollId.toString())

  poll.creator = event.params.creator
  poll.blockCreated = event.params.blockCreated
  poll.pollId = event.params.pollId
  poll.startDate = event.params.startDate
  poll.endDate = msToSecondstime(event.params.endDate)
  poll.multiHash = event.params.multiHash
  poll.url = event.params.url
  poll.votesCount = BIGINT_ZERO
  poll.timeLineCount = BIGINT_ZERO

  poll.save()

  let action = new CreatePollAction(
    'CREATE' +
      '-' +
      event.transaction.hash.toHex() +
      '-' +
      event.params.creator.toHexString(),
  )
  action.poll = event.params.pollId.toString()
  action.block = event.block.number
  action.transactionHash = event.transaction.hash
  action.timestamp = event.block.timestamp
  action.save()

  let governanceInfo = getGovernanceInfoEntity()
  governanceInfo.countPolls = governanceInfo.countPolls.plus(BIGINT_ONE)

  updateGovernanceInfoEntity(event.block, governanceInfo)
}

export function handlePollVote(event: Voted): void {
  let poll = Poll.load(event.params.pollId.toString())

  if (poll !== null) {
    if (poll.endDate < event.block.timestamp) {
      log.warning('handlePollVote: Trying to vote before this Poll ends.', [])
      return
    }

    let id = event.params.pollId.toString() + '-' + event.params.voter.toHexString()
    let pollVote = PollVote.load(id)

    if (pollVote === null) {
      pollVote = new PollVote(id)
      pollVote.voter = event.params.voter
      pollVote.poll = event.params.pollId.toString()
      poll.votesCount = poll.votesCount.plus(BIGINT_ONE)
    }

    pollVote.option = event.params.optionId
    pollVote.block = event.block.number
    pollVote.transactionHash = event.transaction.hash
    pollVote.timestamp = event.block.timestamp
    pollVote.save()

    let action = new VotePollAction(
      'VOTE' + '-' + event.transaction.hash.toHex() + event.params.voter.toHexString(),
    )
    action.sender = event.params.voter
    action.poll = event.params.pollId.toString()
    action.option = event.params.optionId
    action.block = event.block.number
    action.transactionHash = event.transaction.hash
    action.timestamp = event.block.timestamp
    action.save()

    poll.timeLineCount = poll.timeLineCount.plus(BIGINT_ONE)
    poll.save()
  } else {
    log.warning('handlePollVote: No Poll id {} found.', [event.params.pollId.toString()])
  }
}

export function handlePollWithdraw(event: PollWithdrawn): void {
  let poll = Poll.load(event.params.pollId.toString())

  if (poll !== null) {
    let action = new WithdrawPollAction(
      'WITHDRAW' +
        '-' +
        event.transaction.hash.toHex() +
        event.params.creator.toHexString(),
    )
    action.sender = event.params.creator
    action.poll = event.params.pollId.toString()
    action.block = event.block.number
    action.transactionHash = event.transaction.hash
    action.timestamp = event.block.timestamp
    action.save()

    poll.withdrawn = event.block.timestamp
    poll.timeLineCount = poll.timeLineCount.plus(BIGINT_ONE)
    poll.save()
  } else {
    log.warning('handlePollWithdraw: No Poll id {} found.', [
      event.params.pollId.toString(),
    ])
  }
}
