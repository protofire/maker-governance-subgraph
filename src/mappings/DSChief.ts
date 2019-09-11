import { log, BigInt, Bytes, Address, BigDecimal, crypto, EthereumBlock } from '@graphprotocol/graph-ts'

import { LogNote, DSChief, Etch } from '../../generated/DSChief/DSChief'
import { DSSpell } from '../../generated/DSChief/DSSpell'
import { DSSpell as DSSpellTemplate } from '../../generated/templates'
import { AddressVoter, VoteProxy, Action, Slate, Spell, GovernanceInfo } from '../../generated/schema'

import {BIGINT_ONE, toBigDecimal, isSaiMom, getGovernanceInfoEntity, updateGovernanceInfoEntity, toAddress } from '../helpers'

export function handleLock(event: LogNote): void {
  let sender = event.params.guy.toHex()
  let locked = toBigDecimal(event.params.foo)

  let voteProxy = VoteProxy.load(sender)
  let addressVoter = AddressVoter.load(sender)

  let governanceInfo = getGovernanceInfoEntity()

  if (voteProxy != null) {
    voteProxy.locked = voteProxy.locked.plus(locked)
    voteProxy.save()
  } else if (addressVoter != null) {
    addressVoter.locked = addressVoter.locked.plus(locked)
    addressVoter.save()
  } else {
    addressVoter = new AddressVoter(sender)
    addressVoter.locked = locked
    addressVoter.timestamp = event.block.timestamp
    addressVoter.save()

    let action = new Action(
      event.transaction.hash.toHex() + '-' + event.logIndex.toString() + '-' + '-VOTER',
    )
    action.type = 'VOTER'
    action.voterAddress = event.params.guy
    action.timestamp = event.block.timestamp
    action.save()

    governanceInfo.countAddresses = governanceInfo.countAddresses.plus(BIGINT_ONE)
  }

  governanceInfo.locked = governanceInfo.locked.plus(locked)

  let action = new Action(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString(),
  )
  action.type = 'LOCK'
  action.sender = event.params.guy
  action.wad = locked
  action.transactionHash = event.transaction.hash
  action.timestamp = event.block.timestamp
  action.save()

  governanceInfo.countLock = governanceInfo.countLock.plus(BIGINT_ONE)

  updateGovernanceInfoEntity(event.block, governanceInfo)
}

export function handleFree(event: LogNote): void {
  let sender = event.params.guy.toHex()
  let free = toBigDecimal(event.params.foo)

  let voteProxy = VoteProxy.load(sender)
  let addressVoter = AddressVoter.load(sender)

  if (voteProxy != null) {
    voteProxy.locked = voteProxy.locked.minus(free)
    voteProxy.save()
  } else if (addressVoter != null) {
    addressVoter.locked = addressVoter.locked.minus(free)
    addressVoter.save()
  } else {
    log.error('handleFree: No VoteProxy nor addressVoter id {} found.', [sender])
    return
  }

  let governanceInfo = getGovernanceInfoEntity()
  governanceInfo.locked = governanceInfo.locked.minus(free)

  let action = new Action(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString(),
  )
  action.type = 'FREE'
  action.sender = event.params.guy
  action.wad = free
  action.transactionHash = event.transaction.hash
  action.timestamp = event.block.timestamp
  action.save()

  governanceInfo.countFree = governanceInfo.countFree.plus(BIGINT_ONE)

  updateGovernanceInfoEntity(event.block, governanceInfo)
}

export function handleVote(event: LogNote): void {
  let sender = event.params.guy
  let slateID = event.params.foo

  handleSlate(slateID, event.address, event.block)

  let slate = Slate.load(slateID.toHex())
  let voteProxy = VoteProxy.load(sender.toHex())
  let addressVoter = AddressVoter.load(sender.toHex())

  if (slate == null) {
    log.error('handleVote: Slate with id {} not found.', [slateID.toHex()])
    return
  }

  if (voteProxy != null) {
    voteProxy.votedSlate = slate.id
    voteProxy.save()
  } else if (addressVoter != null) {
    addressVoter.votedSlate = slate.id
    addressVoter.save()
  } else {
    log.error('handleVote: No VoteProxy nor addressVoter id {} found.', [slateID.toHex()])
    return
  }

  let action = new Action(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString(),
  )
  action.type = 'VOTE'
  action.sender = sender
  action.yays = slate.yays
  action.transactionHash = event.transaction.hash
  action.timestamp = event.block.timestamp
  action.save()

  updateGovernanceInfoEntity(event.block)
}

export function handleVoteArray(event: LogNote): void {
  let sender = event.params.guy
  let dsChief = DSChief.bind(event.address)
  let slateID = dsChief.votes(sender)

  handleSlate(slateID, event.address, event.block)

  let slate = Slate.load(slateID.toHex())
  let voteProxy = VoteProxy.load(sender.toHex())
  let addressVoter = AddressVoter.load(sender.toHex())

  if (slate == null) {
    log.error('handleVote: Slate with id {} not found.', [slateID.toHex()])
    return
  }

  if (voteProxy != null) {
    voteProxy.votedSlate = slate.id
    voteProxy.save()
  } else if (addressVoter != null) {
    addressVoter.votedSlate = slate.id
    addressVoter.save()
  } else {
    log.error('handleVote: No VoteProxy nor addressVoter id {} found.', [slateID.toHex()])
    return
  }

  let action = new Action(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString(),
  )
  action.type = 'VOTE'
  action.sender = sender
  action.yays = slate.yays
  action.transactionHash = event.transaction.hash
  action.timestamp = event.block.timestamp
  action.save()

  updateGovernanceInfoEntity(event.block)
}

export function handleEtch(event: Etch): void {
  let slateID = event.params.slate

  handleSlate(slateID, event.address, event.block)

  let action = new Action(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString(),
  )
  action.type = 'ETCH'
  action.sender = event.transaction.from // TODO - check this
  action.transactionHash = event.transaction.hash
  action.timestamp = event.block.timestamp
  action.save()
}

function handleSlate(slateID: Bytes, chiefAddress: Address, block: EthereumBlock, governanceInfo: GovernanceInfo = getGovernanceInfoEntity()): void {
  if (Slate.load(slateID.toHex()) != null) {
    return
  }

  let slate = new Slate(slateID.toHex())
  slate.yays = new Array<Bytes>()
  slate.timestamp = block.timestamp

  let dsChief = DSChief.bind(chiefAddress)

  let i = 0
  let slateResponse = dsChief.try_slates(slateID, BigInt.fromI32(i))

  while (!slateResponse.reverted) {
    let spellAddress = slateResponse.value
    let spell = Spell.load(spellAddress.toHexString())

    // FIXME - Remove address blacklist check once https://github.com/graphprotocol/support/issues/30 gets fixed
    if (spell == null && (
      spellAddress.toHex() != '0x483574d869bc34d2131032e65a3114a901928e91' &&
      spellAddress.toHex() != '0xe7bbc8fea57a92fc307d650d78e5481b25ccedff'
    )) {
      spell = new Spell(spellAddress.toHexString())
      spell.timestamp = block.timestamp

      let dsSpell = DSSpell.bind(spellAddress)
      let dsResponse = dsSpell.try_whom()

      if (!dsResponse.reverted && isSaiMom(dsResponse.value)) {
        // Start traking this DS-Spell
        DSSpellTemplate.create(spellAddress)
        // Update spells count
        governanceInfo.countSpells = governanceInfo.countSpells.plus(BIGINT_ONE)

        spell.save()
      }
    }
    // Save slate's yay (even if it isn't a spell)
    slate.yays = slate.yays.concat([spellAddress])
    slateResponse = dsChief.try_slates(slateID, BigInt.fromI32(++i))
  }

  slate.save()

  governanceInfo.countSlates = governanceInfo.countSlates.plus(BIGINT_ONE)
  updateGovernanceInfoEntity(block, governanceInfo)
}

export function handleLift(event: LogNote): void {
  let sender = event.params.guy
  let whom = toAddress(event.params.foo)
  let dsChief = DSChief.bind(event.address)

  let spellEntity = Spell.load(whom.toHexString())
  let approval = dsChief.approvals(whom)

  // How much MKR it has when the spell is lifted to hat
  spellEntity.lifted = event.block.timestamp
  spellEntity.liftedWith = approval
  spellEntity.save()

  let governanceInfo = getGovernanceInfoEntity()
  governanceInfo.hat = whom
  governanceInfo.save()

  let action = new Action(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString(),
  )
  action.type = 'LIFT'
  action.sender = sender
  action.hat = whom
  action.transactionHash = event.transaction.hash
  action.timestamp = event.block.timestamp
  action.save()

  updateGovernanceInfoEntity(event.block)
}
