import { log } from '@graphprotocol/graph-ts'

import { LinkConfirmed as LinkConfirmedEvent } from '../../generated/VoteProxyFactory/VoteProxyFactory'
import { VoteProxy, VoterRegistry } from '../../generated/schema'

import { BIGDECIMAL_ZERO, BIGINT_ONE, getGovernanceInfoEntity } from '../helpers'

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
