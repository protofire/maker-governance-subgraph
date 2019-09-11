import { Address, log } from '@graphprotocol/graph-ts'

import { DSSpell, LogNote } from '../../generated/templates/DSSpell/DSSpell'
import { Spell, Action } from '../../generated/schema'
import { DSChief } from '../../generated/templates/DSSpell/DSChief'
import { BIGINT_ONE, getGovernanceInfoEntity, updateGovernanceInfoEntity } from '../helpers';

export function handleCast(event: LogNote): void {
  let contract = DSSpell.bind(event.address)

  let dsChief = DSChief.bind(Address.fromString('0x9eF05f7F6deB616fd37aC3c959a2dDD25A54E4F5'))
  let approval = dsChief.approvals(event.address)

  let response = contract.try_done()

  if (!response.reverted && response.value) {
    let spellEntity = Spell.load(event.address.toHexString())
    spellEntity.casted = event.block.timestamp
    spellEntity.castedWith = approval
    spellEntity.save()

    let action = new Action(
      event.transaction.hash.toHex() + '-' + event.logIndex.toString(),
    )
    action.type = 'CAST'
    action.sender = event.params.guy
    action.spell = event.address
    action.transactionHash = event.transaction.hash
    action.timestamp = event.block.timestamp
    action.save()
  }

  let governanceInfo = getGovernanceInfoEntity()
  governanceInfo.countCasted = governanceInfo.countCasted.plus(BIGINT_ONE)

  updateGovernanceInfoEntity(event.block)
}
