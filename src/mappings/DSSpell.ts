import { Address, log } from '@graphprotocol/graph-ts'

import { DSChief } from '../../generated/templates/DSSpell/DSChief'
import { LogNote } from '../../generated/templates/DSSpell/DSSpell'

import { Spell, Action } from '../../generated/schema'

import {
  BIGINT_ONE,
  getGovernanceInfoEntity,
  updateGovernanceInfoEntity,
  fromBigIntToBigDecimal,
} from '../helpers'

import { DS_CHIEF } from '../constants'

export function handleCast(event: LogNote): void {
  let dsChief = DSChief.bind(Address.fromString(DS_CHIEF))
  let approval = dsChief.approvals(event.address)

  log.info('Spell {} has been casted.', [event.address.toHexString()])

  let spellEntity = Spell.load(event.address.toHexString())
  spellEntity.casted = event.block.timestamp
  spellEntity.castedWith = fromBigIntToBigDecimal(approval)
  spellEntity.save()

  let action = new Action(
    'CAST' + '-' + event.transaction.hash.toHex() + '-' + event.logIndex.toString(),
  )
  action.type = 'CAST'
  action.sender = event.params.guy
  action.spell = event.address
  action.block = event.block.number
  action.transactionHash = event.transaction.hash
  action.timestamp = event.block.timestamp
  action.save()

  let governanceInfo = getGovernanceInfoEntity()
  governanceInfo.countCasted = governanceInfo.countCasted.plus(BIGINT_ONE)

  updateGovernanceInfoEntity(event.block)
}
