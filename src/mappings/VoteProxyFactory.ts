import { log } from '@graphprotocol/graph-ts'

import { LinkConfirmed as LinkConfirmedEvent } from '../../generated/VoteProxyFactory/VoteProxyFactory'
import { VoteProxy, VoterRegistry, Action } from '../../generated/schema'

import {
  BIGDECIMAL_ZERO,
  BIGINT_ONE,
  getGovernanceInfoEntity,
  updateGovernanceInfoEntity,
} from '../helpers'

export function handleLinkConfirmed(event: LinkConfirmedEvent): void {
  let voteRegistry = new VoterRegistry(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString(),
  )

  voteRegistry.coldAddress = event.params.cold
  voteRegistry.hotAddress = event.params.hot
  voteRegistry.block = event.block.number
  voteRegistry.transactionHash = event.transaction.hash
  voteRegistry.timestamp = event.block.timestamp
  voteRegistry.save()

  let voteProxy = new VoteProxy(event.params.voteProxy.toHex())
  voteProxy.owner = voteRegistry.id
  voteProxy.locked = BIGDECIMAL_ZERO
  voteProxy.save()

  let governanceInfo = getGovernanceInfoEntity()
  governanceInfo.countProxies = governanceInfo.countProxies.plus(BIGINT_ONE)

  let action = new Action(
    'PROXY-VOTER' +
      '-' +
      event.transaction.hash.toHex() +
      '-' +
      event.logIndex.toString(),
  )
  action.type = 'VOTER'
  action.sender = event.transaction.from
  action.voterAddress = event.params.voteProxy
  action.isVoteProxy = true
  action.timestamp = event.block.timestamp
  action.save()

  updateGovernanceInfoEntity(event.block, governanceInfo)
}
