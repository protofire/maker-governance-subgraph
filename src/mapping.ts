import { log, BigInt } from '@graphprotocol/graph-ts'

import { LinkConfirmed as LinkConfirmedEvent } from '../generated/VoteProxyFactory/VoteProxyFactory'
import { LogNote, DSChief, Etch } from '../generated/DSChief/DSChief'
import { PollCreated } from '../generated/PollingEmitter/PollingEmitter'
import { VoteProxy, VoterRegistry, GovernanceInfo, Action, ExecutiveVote, PollVote } from '../generated/schema'

import { BIGDECIMAL_ZERO, BIGINT_ONE, BIGINT_ZERO, toBigDecimal } from './helpers'

export function handleLinkConfirmed(event: LinkConfirmedEvent): void {
  let voteRegistry = new VoterRegistry(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString(),
  )
  voteRegistry.coldAddress = event.params.cold
  voteRegistry.hotAddress = event.params.hot
  voteRegistry.save()

  let voteProxy = new VoteProxy(event.params.voteProxy.toHex())
  voteProxy.owner = voteRegistry.id
  voteProxy.timestamp = event.block.timestamp
  voteProxy.address = event.params.voteProxy
  voteProxy.locked = BIGDECIMAL_ZERO
  voteProxy.save()

  let governanceInfo = getGovernanceInfoEntity()
  governanceInfo.countVoters = governanceInfo.countVoters.plus(BIGINT_ONE)
  governanceInfo.save()
}

export function handleLock(event: LogNote): void {
  let voteProxy = getLogNoteData(event, 'handleLock')
  if (voteProxy == null) return
  let locked = toBigDecimal(event.params.foo)
  voteProxy.locked = voteProxy.locked.plus(locked)
  voteProxy.save()

  let governanceInfo = getGovernanceInfoEntity()
  governanceInfo.locked = governanceInfo.locked.plus(locked)
  governanceInfo.lastBlock = event.block.number
  governanceInfo.save()

  let action = new Action(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString(),
  )
  action.type = 'LOCK'
  action.sender = event.params.guy
  action.wad = locked
  action.transactionHash = event.transaction.hash
  action.timestamp = event.block.timestamp
  action.save()
}

export function handleFree(event: LogNote): void {
  let voteProxy = getLogNoteData(event, 'handleFree')
  if (voteProxy == null) return
  let free = toBigDecimal(event.params.foo)
  voteProxy.locked = voteProxy.locked.minus(free)
  voteProxy.save()

  let governanceInfo = getGovernanceInfoEntity()
  governanceInfo.locked = governanceInfo.locked.minus(free)
  governanceInfo.lastBlock = event.block.number
  governanceInfo.save()

  let action = new Action(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString(),
  )
  action.type = 'FREE'
  action.sender = event.params.guy
  action.wad = free
  action.transactionHash = event.transaction.hash
  action.timestamp = event.block.timestamp
  action.save()
}

export function handleVote(event: LogNote): void {}

function getGovernanceInfoEntity(): GovernanceInfo {
  let id = '0x0'
  let entity = GovernanceInfo.load(id)

  if (entity == null) {
    entity = new GovernanceInfo(id)
    entity.countVoters = BIGINT_ZERO
    entity.locked = BIGDECIMAL_ZERO
    entity.lastBlock = BIGINT_ZERO
  }

  return entity as GovernanceInfo
}

function getLogNoteData(event: LogNote, method: string): VoteProxy {
  let voteProxyId = event.params.guy.toHex()

  let voteProxy = VoteProxy.load(voteProxyId)
  if (voteProxy == null)
    log.error('{}: VoteProxy with id {} not found.', [method, voteProxyId])

  return voteProxy as VoteProxy
}

export function handleEtch(event: Etch): void {
  let executiveVote = new ExecutiveVote(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString(),
  )

  executiveVote.slate = event.params.slate


  let contract = DSChief.bind(event.address)
  // let response = contract.try_MAX_YAYS()
  // let response = contract.try_slates(executiveVote.slate, BIGINT_ZERO)

  // log.error('SLATE {}, address0 {}', [event.params.slate.toHexString(), response.value.toHexString()])

  // log.debug(
  //   'Reverted: {}, value: {}',
  //   [
    //     response.reverted ? 'YES' : 'NO',
    //     response.value.toHexString()
    //   ]
    // )

  executiveVote.save()

  let action = new Action(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString(),
  )
  action.type = 'CRETATE_EXECUTIVE_VOTE'
  action.sender = event.address // TODO - check this
  action.transactionHash = event.transaction.hash
  action.timestamp = event.block.timestamp
  action.save()

  let governanceInfo = getGovernanceInfoEntity()
  governanceInfo.countExecutiveVotes = governanceInfo.countExecutiveVotes.plus(BIGINT_ONE)
  governanceInfo.lastBlock = event.block.number
  governanceInfo.save()
}
export function handlePollCreated(event: PollCreated): void {
  let pollVote = new PollVote(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString(),
  )

  pollVote.creator = event.params.creator
  pollVote.blockCreated = event.params.blockCreated
  pollVote.pollId = event.params.pollId
  pollVote.startDate = event.params.startDate
  pollVote.endDate = event.params.endDate
  pollVote.multiHash = event.params.multiHash
  pollVote.url = event.params.url

  pollVote.save()

  let action = new Action(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString(),
  )
  action.type = 'CRETATE_POLL_VOTE'
  action.sender = event.address // TODO - check this
  action.transactionHash = event.transaction.hash
  action.timestamp = event.block.timestamp
  action.save()

  let governanceInfo = getGovernanceInfoEntity()
  governanceInfo.countPollVotes = governanceInfo.countPollVotes.plus(BIGINT_ONE)
  governanceInfo.lastBlock = event.block.number
  governanceInfo.save()
}
