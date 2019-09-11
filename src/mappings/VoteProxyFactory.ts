import { log } from '@graphprotocol/graph-ts'

import { LinkConfirmed as LinkConfirmedEvent } from '../../generated/VoteProxyFactory/VoteProxyFactory'
import { VoteProxy, VoterRegistry, Action } from '../../generated/schema'

import { BIGDECIMAL_ZERO, BIGINT_ONE, getGovernanceInfoEntity, updateGovernanceInfoEntity } from '../helpers'

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
  voteProxy.locked = BIGDECIMAL_ZERO
  voteProxy.save()

  let governanceInfo = getGovernanceInfoEntity()
  governanceInfo.countProxies = governanceInfo.countProxies.plus(BIGINT_ONE)

  let action = new Action(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString() + '-' + '-VOTER',
  )
  action.type = 'VOTER'
  action.voterAddress = event.params.voteProxy
  action.isVoteProxy = true
  action.timestamp = event.block.timestamp
  action.save()

  updateGovernanceInfoEntity(event.block, governanceInfo)
}
