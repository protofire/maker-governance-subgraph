import { log } from '@graphprotocol/graph-ts'

import { DSSpell, LogNote } from '../../generated/templates/DSSpell/DSSpell'
import { Spell } from '../../generated/schema'

export function handleCast(event: LogNote): void {
  let contract = DSSpell.bind(event.address)

  let response = contract.try_done()

  log.error('SPELL {} (REVERTED {}) CASTED {} ON {}', [event.address.toHex(), response.reverted ? 'YES' : 'NO', !response.reverted && response.value ? 'YES' : 'NO', event.block.timestamp.toString()])

  if (!response.reverted && response.value) {
    let spellEntity = Spell.load(event.address.toHexString())
    spellEntity.casted = event.block.timestamp
    spellEntity.save()
  }
}
