import { log, BigInt, Bytes } from '@graphprotocol/graph-ts'

import { LogNote, DSChief, Etch } from '../../generated/DSChief/DSChief'
import { DSSpell } from '../../generated/DSChief/DSSpell'
import { DSSpell as DSSpellTemplate } from '../../generated/templates'
import { VoteProxy, Action, Slate, Spell } from '../../generated/schema'

import {BIGINT_ONE, toBigDecimal, isSaiMom, getGovernanceInfoEntity } from '../helpers'

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

export function handleEtch(event: Etch): void {
  let slateID = event.params.slate
  let slate = Slate.load(slateID.toHex())
  if (slate == null) {
    slate = new Slate(slateID.toHex())
    slate.yays = new Array<Bytes>()
  }

  let governanceInfo = getGovernanceInfoEntity()
  let dsChief = DSChief.bind(event.address)

  let i = 0
  let slateResponse = dsChief.try_slates(slateID, BigInt.fromI32(i))

  while (!slateResponse.reverted) {
    let spellAddress = slateResponse.value
    let spell = Spell.load(spellAddress.toHexString())
    if (spell == null) {
      spell = new Spell(spellAddress.toHexString())
      spell.timestamp = event.block.timestamp

      let dsSpell = DSSpell.bind(spellAddress)
      let dsResponse = dsSpell.try_whom()

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
  governanceInfo.lastBlock = event.block.number
  governanceInfo.save()
}

function getLogNoteData(event: LogNote, method: string): VoteProxy {
  let voteProxyId = event.params.guy.toHex()

  let voteProxy = VoteProxy.load(voteProxyId)
  if (voteProxy == null)
    log.error('{}: VoteProxy with id {} not found.', [method, voteProxyId])

  return voteProxy as VoteProxy
}
