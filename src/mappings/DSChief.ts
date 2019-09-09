import { log, BigInt, Bytes, Address, BigDecimal } from '@graphprotocol/graph-ts'

import { LogNote, DSChief, Etch } from '../../generated/DSChief/DSChief'
import { DSSpell } from '../../generated/DSChief/DSSpell'
import { DSSpell as DSSpellTemplate } from '../../generated/templates'
import { VoteProxy, Action, Slate, Spell } from '../../generated/schema'

import {BIGINT_ONE, toBigDecimal, isSaiMom, getGovernanceInfoEntity, updateGovernanceInfoEntity, toAddress } from '../helpers'

export function handleLock(event: LogNote): void {
  let voteProxy = getLogNoteData(event, 'handleLock')
  if (voteProxy == null) return
  let locked = toBigDecimal(event.params.foo)
  voteProxy.locked = voteProxy.locked.plus(locked)
  voteProxy.save()

  let governanceInfo = getGovernanceInfoEntity()
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

  updateGovernanceInfoEntity(event.block, governanceInfo)
}

export function handleFree(event: LogNote): void {
  let voteProxy = getLogNoteData(event, 'handleFree')
  if (voteProxy == null) return
  let free = toBigDecimal(event.params.foo)
  voteProxy.locked = voteProxy.locked.minus(free)
  voteProxy.save()

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

  updateGovernanceInfoEntity(event.block, governanceInfo)
}

export function handleVote(event: LogNote): void {
  let sender = event.params.guy
  let slateID = event.params.foo

  log.error('HANDLEVOTE: PROXY {} SLATE {}', [sender.toHex(), slateID.toHex()])

  let slate = Slate.load(slateID.toHex())
  let voteProxy = VoteProxy.load(sender.toHex())

  // FIXME - There are cases where vote is coming directly from a wallet address. We need to define how to handle such cases
  if (voteProxy == null) {
    log.error('handleVote: VoteProxy with id {} not found.', [sender.toHex()])
    return
  }

  if (slate == null) {
    log.error('handleVote: Slate with id {} not found.', [slateID.toHex()])
    return
  }

  voteProxy.votedSlate = slate.id

  voteProxy.save()

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
  let slate = Slate.load(slateID.toHex())
  if (slate == null) {
    slate = new Slate(slateID.toHex())
    slate.yays = new Array<Bytes>()
    slate.timestamp = event.block.timestamp
  }

  let governanceInfo = getGovernanceInfoEntity()
  let dsChief = DSChief.bind(event.address)

  log.error('TRY_SLATES {} ', [slateID.toHexString()])

  let i = 0
  let slateResponse = dsChief.try_slates(slateID, BigInt.fromI32(i))

  while (!slateResponse.reverted) {
    let spellAddress = slateResponse.value
    let spell = Spell.load(spellAddress.toHexString())

    // FIXME - Remove address check once https://github.com/graphprotocol/support/issues/30 gets fixed
    if (spell == null && spellAddress.toHex() != '0x483574d869bc34d2131032e65a3114a901928e91') {
      spell = new Spell(spellAddress.toHexString())
      spell.timestamp = event.block.timestamp

      log.error('BEFORE BIND {} ', [spellAddress.toHexString()])
      let dsSpell = DSSpell.bind(spellAddress)
      log.error('TRY_WHOM {} ', [spellAddress.toHexString()])
      let dsResponse = dsSpell.try_whom()
      log.error('REVERTED {} WHOM {}', [dsResponse.reverted ? 'YES' : 'NO', dsResponse.reverted ? 'REV' : dsResponse.value.toHexString()])

      if (!dsResponse.reverted && isSaiMom(dsResponse.value)) {
        // Start traking this DS-Spell
        DSSpellTemplate.create(spellAddress)
        // Save spell as slate's yay
        slate.yays.push(spellAddress)
        // Update spells count
        governanceInfo.countSpells = governanceInfo.countSpells.plus(BIGINT_ONE)

        spell.save()
      }
    }

    slateResponse = dsChief.try_slates(slateID, BigInt.fromI32(++i))
  }

  slate.save()

  let action = new Action(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString(),
  )
  action.type = 'CRETATE_EXECUTIVE_VOTE'
  action.sender = event.address // TODO - check this
  action.transactionHash = event.transaction.hash
  action.timestamp = event.block.timestamp
  action.save()

  governanceInfo.countSlates = governanceInfo.countSlates.plus(BIGINT_ONE)
  updateGovernanceInfoEntity(event.block, governanceInfo)
}

export function handleLift(event: LogNote): void {
  let sender = event.params.guy
  let whom = toAddress(event.params.foo)
  let dsChief = DSChief.bind(event.address)

  let spellEntity = Spell.load(whom.toHexString())
  log.error('TRYAPPROVALS {}', [whom.toHexString()])
  let approval = dsChief.approvals(Address.fromString(whom.toHex()))
  // How much MKR it has when the spell is lifted to hat
  spellEntity.approval = approval

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

function getLogNoteData(event: LogNote, method: string): VoteProxy {
  let voteProxyId = event.params.guy.toHex()

  let voteProxy = VoteProxy.load(voteProxyId)
  if (voteProxy == null)
    log.error('{}: VoteProxy with id {} not found.', [method, voteProxyId])

  return voteProxy as VoteProxy
}
