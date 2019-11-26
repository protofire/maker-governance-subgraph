import { Address, log } from '@graphprotocol/graph-ts'

import {
  DssLaunchSpell,
  CastCall,
} from '../../generated/templates/DssLaunchSpell/DssLaunchSpell'
import { Spell, Action } from '../../generated/schema'
import { DSChief } from '../../generated/templates/DssLaunchSpell/DSChief'
import {
  BIGINT_ONE,
  getGovernanceInfoEntity,
  updateGovernanceInfoEntity,
  fromBigIntToBigDecimal,
} from '../helpers'

export function handleCast(call: CastCall): void {
  let dsChief = DSChief.bind(
    Address.fromString('0x9eF05f7F6deB616fd37aC3c959a2dDD25A54E4F5'),
  )
  let approval = dsChief.approvals(call.to)

  log.info('DssLaunchSpell {} has been casted.', [call.to.toHexString()])

  let spellEntity = Spell.load(call.to.toHexString())
  spellEntity.casted = call.block.timestamp
  spellEntity.castedWith = fromBigIntToBigDecimal(approval)
  spellEntity.save()

  let action = new Action(
    'CAST' + '-' + call.transaction.hash.toHex() + '-' + call.to.toHexString(),
  )
  action.type = 'CAST'
  action.sender = call.from
  action.spell = call.to
  action.block = call.block.number
  action.transactionHash = call.transaction.hash
  action.timestamp = call.block.timestamp
  action.save()

  let governanceInfo = getGovernanceInfoEntity()
  governanceInfo.countCasted = governanceInfo.countCasted.plus(BIGINT_ONE)
  governanceInfo.save()

  updateGovernanceInfoEntity(call.block)
}
