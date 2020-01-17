import {
  log,
  BigInt,
  Bytes,
  Address,
  BigDecimal,
  EthereumBlock,
} from '@graphprotocol/graph-ts'

import { LogNote, DSChief, Etch } from '../../generated/DSChief/DSChief'
import { DSSpell } from '../../generated/DSChief/DSSpell'
import { RaiseCeilingLowerSF } from '../../generated/DSChief/RaiseCeilingLowerSF'

import {
  DSSpell as DSSpellTemplate,
  RaiseCeilingLowerSF as RaiseCeilingLowerSFTemplate,
  DssSpellPaused as DssSpellPausedTemplate,
} from '../../generated/templates'

import {
  AddressVoter,
  VoteProxy,
  Action,
  Slate,
  Spell,
  GovernanceInfo,
  AddAction,
  RemoveAction,
  LockAction,
  FreeAction,
} from '../../generated/schema'

import {
  BIGINT_ONE,
  BIGINT_ZERO,
  BIGDECIMAL_ZERO,
  toBigDecimal,
  fromBigIntToBigDecimal,
  isSaiMom,
  getGovernanceInfoEntity,
  updateGovernanceInfoEntity,
  toAddress,
  isDssSpellPaused,
} from '../helpers'

export function handleLock(event: LogNote): void {
  let sender = event.params.guy.toHex()
  let locked = toBigDecimal(event.params.foo)

  let voteProxy = VoteProxy.load(sender)
  let addressVoter = AddressVoter.load(sender)

  let votedSlate: string

  let governanceInfo = getGovernanceInfoEntity()

  if (voteProxy != null) {
    voteProxy.locked = voteProxy.locked.plus(locked)
    voteProxy.save()

    votedSlate = voteProxy.votedSlate
  } else if (addressVoter != null) {
    addressVoter.locked = addressVoter.locked.plus(locked)
    addressVoter.save()

    votedSlate = addressVoter.votedSlate
  } else {
    addressVoter = new AddressVoter(sender)
    addressVoter.locked = locked
    addressVoter.timestamp = event.block.timestamp
    addressVoter.save()

    let action = new Action(
      'ADDRESS-VOTER' +
        '-' +
        event.transaction.hash.toHex() +
        '-' +
        event.logIndex.toString(),
    )
    action.type = 'VOTER'
    action.voterAddress = event.params.guy
    action.block = event.block.number
    action.transactionHash = event.transaction.hash
    action.timestamp = event.block.timestamp
    action.save()

    governanceInfo.countAddresses = governanceInfo.countAddresses.plus(BIGINT_ONE)
  }

  governanceInfo.locked = governanceInfo.locked.plus(locked)

  let action = new Action(
    'LOCK' + '-' + event.transaction.hash.toHex() + '-' + event.logIndex.toString(),
  )
  action.type = 'LOCK'
  action.sender = event.params.guy
  action.wad = locked
  action.block = event.block.number
  action.transactionHash = event.transaction.hash
  action.timestamp = event.block.timestamp
  action.save()

  if (votedSlate !== null) {
    let slate = Slate.load(votedSlate)
    saveLockAction(slate.yays as Bytes[], event, locked, 'LOCK')
  }

  governanceInfo.countLock = governanceInfo.countLock.plus(BIGINT_ONE)

  updateGovernanceInfoEntity(event.block, governanceInfo)
}

export function handleFree(event: LogNote): void {
  let sender = event.params.guy.toHex()
  let free = toBigDecimal(event.params.foo)

  let voteProxy = VoteProxy.load(sender)
  let addressVoter = AddressVoter.load(sender)

  let votedSlate: string

  if (voteProxy != null) {
    voteProxy.locked = voteProxy.locked.minus(free)
    voteProxy.save()

    votedSlate = voteProxy.votedSlate
  } else if (addressVoter != null) {
    addressVoter.locked = addressVoter.locked.minus(free)
    addressVoter.save()

    votedSlate = addressVoter.votedSlate
  } else {
    log.warning('handleFree: No VoteProxy nor addressVoter id {} found.', [sender])
    return
  }

  let governanceInfo = getGovernanceInfoEntity()
  governanceInfo.locked = governanceInfo.locked.minus(free)

  let action = new Action(
    'FREE' + '-' + event.transaction.hash.toHex() + '-' + event.logIndex.toString(),
  )
  action.type = 'FREE'
  action.sender = event.params.guy
  action.wad = free
  action.block = event.block.number
  action.transactionHash = event.transaction.hash
  action.timestamp = event.block.timestamp
  action.save()

  if (votedSlate !== null) {
    let slate = Slate.load(votedSlate)
    saveFreeAction(slate.yays as Bytes[], event, free, 'FREE')
  }

  governanceInfo.countFree = governanceInfo.countFree.plus(BIGINT_ONE)

  updateGovernanceInfoEntity(event.block, governanceInfo)
}

export function handleVote(event: LogNote): void {
  let sender = event.params.guy
  let slateID = event.params.foo

  let dsChief = DSChief.bind(event.address)
  let locked = dsChief.deposits(sender)

  handleSlate(slateID, event.address, event.block)

  let slate = Slate.load(slateID.toHex())
  let voteProxy = VoteProxy.load(sender.toHex())
  let addressVoter = AddressVoter.load(sender.toHex())

  if (slate == null) {
    log.warning('handleVote: Slate with id {} not found.', [slateID.toHex()])
    return
  }

  let newYays = new Array<string>()
  for (let index = 0; index < slate.yays.length; index++) {
    let yay = (slate.yays as Bytes[])[index]
    if (yay !== null) {
      newYays.push(yay.toHexString())
    }
  }
  let prevVotedSlateId: string

  if (voteProxy != null) {
    prevVotedSlateId = voteProxy.votedSlate
    voteProxy.votedSlate = slate.id
    voteProxy.save()
  } else if (addressVoter != null) {
    prevVotedSlateId = addressVoter.votedSlate
    addressVoter.votedSlate = slate.id
    addressVoter.save()
  } else {
    log.warning('handleVote: No VoteProxy nor addressVoter id {} found.', [
      sender.toHex(),
    ])
    return
  }

  let prevVotedSlate = Slate.load(prevVotedSlateId)
  let prevYays = new Array<string>()
  // let prevYays = new Array<Bytes>()
  for (let index = 0; index < prevVotedSlate.yays.length; index++) {
    let yay = (prevVotedSlate.yays as Bytes[])[index]
    if (yay !== null) {
      prevYays.push(yay.toHexString())
    }
  }

  let addedYays = new Array<Bytes>()
  if (newYays !== null) {
    for (let index = 0; index < newYays.length; index++) {
      let yay = (newYays as string[])[index]
      if (yay !== null) {
        if (prevYays.indexOf(yay) == -1) {
          addedYays.push(Bytes.fromHexString(yay as string) as Bytes)
        }
      }
    }
  }

  saveAddAction(addedYays, event, fromBigIntToBigDecimal(locked), 'ADD')

  let removedYays = new Array<Bytes>()
  if (prevYays != null) {
    for (let index = 0; index < prevYays.length; index++) {
      let yay = (prevYays as string[])[index]
      if (yay !== null) {
        if (newYays.indexOf(yay) == -1) {
          removedYays.push(Bytes.fromHexString(yay as string) as Bytes)
        }
      }
    }
  }

  saveRemoveAction(removedYays, event, fromBigIntToBigDecimal(locked), 'REMOVE')

  let action = new Action(
    'VOTE' + '-' + event.transaction.hash.toHex() + '-' + event.logIndex.toString(),
  )
  action.type = 'VOTE'
  action.sender = sender
  action.wad = fromBigIntToBigDecimal(locked)
  action.yays = slate.yays
  action.block = event.block.number
  action.transactionHash = event.transaction.hash
  action.timestamp = event.block.timestamp
  action.save()

  updateGovernanceInfoEntity(event.block)
}

export function handleVoteArray(event: LogNote): void {
  let sender = event.params.guy
  let dsChief = DSChief.bind(event.address)
  let slateID = dsChief.votes(sender)
  let locked = dsChief.deposits(sender)

  handleSlate(slateID, event.address, event.block)

  let slate = Slate.load(slateID.toHex())
  let voteProxy = VoteProxy.load(sender.toHex())
  let addressVoter = AddressVoter.load(sender.toHex())

  if (slate == null) {
    log.warning('handleVote: Slate with id {} not found.', [slateID.toHex()])
    return
  }

  let newYays = new Array<string>()
  for (let index = 0; index < slate.yays.length; index++) {
    let yay = (slate.yays as Bytes[])[index]
    if (yay !== null) {
      newYays.push(yay.toHexString())
    }
  }
  let prevVotedSlateId: string

  if (voteProxy != null) {
    prevVotedSlateId = voteProxy.votedSlate
    voteProxy.votedSlate = slate.id
    voteProxy.save()
  } else if (addressVoter != null) {
    prevVotedSlateId = addressVoter.votedSlate
    addressVoter.votedSlate = slate.id
    addressVoter.save()
  } else {
    log.warning('handleVote: No VoteProxy nor addressVoter id {} found.', [
      sender.toHex(),
    ])
    return
  }

  let prevVotedSlate = Slate.load(prevVotedSlateId)
  let prevYays = new Array<string>()
  for (let index = 0; index < prevVotedSlate.yays.length; index++) {
    let yay = (prevVotedSlate.yays as Bytes[])[index]
    if (yay !== null) {
      prevYays.push(yay.toHexString())
    }
  }

  let addedYays = new Array<Bytes>()
  if (newYays !== null) {
    for (let index = 0; index < newYays.length; index++) {
      let yay = (newYays as string[])[index]
      if (yay !== null) {
        if (prevYays.indexOf(yay) == -1) {
          addedYays.push(Bytes.fromHexString(yay as string) as Bytes)
        }
      }
    }
  }

  saveAddAction(addedYays, event, fromBigIntToBigDecimal(locked), 'ADD-ARRAY')

  let removedYays = new Array<Bytes>()
  if (prevYays != null) {
    for (let index = 0; index < prevYays.length; index++) {
      let yay = (prevYays as string[])[index]
      if (yay !== null) {
        if (newYays.indexOf(yay) == -1) {
          let test = Bytes.fromHexString(yay as string) as Bytes
          removedYays.push(Bytes.fromHexString(yay as string) as Bytes)
        }
      }
    }
  }

  saveRemoveAction(removedYays, event, fromBigIntToBigDecimal(locked), 'REMOVE-ARRAY')

  let action = new Action(
    'VOTE' + '-' + event.transaction.hash.toHex() + '-' + event.logIndex.toString(),
  )
  action.type = 'VOTE'
  action.sender = sender
  action.wad = fromBigIntToBigDecimal(locked)
  action.yays = slate.yays
  action.block = event.block.number
  action.transactionHash = event.transaction.hash
  action.timestamp = event.block.timestamp
  action.save()

  updateGovernanceInfoEntity(event.block)
}

export function handleEtch(event: Etch): void {
  let slateID = event.params.slate

  handleSlate(slateID, event.address, event.block)

  let action = new Action(
    'ETCH' + '-' + event.transaction.hash.toHex() + '-' + event.logIndex.toString(),
  )
  action.type = 'ETCH'
  action.sender = event.transaction.from
  action.block = event.block.number
  action.transactionHash = event.transaction.hash
  action.timestamp = event.block.timestamp
  action.save()
}

function handleSlate(
  slateID: Bytes,
  chiefAddress: Address,
  block: EthereumBlock,
  governanceInfo: GovernanceInfo = getGovernanceInfoEntity(),
): void {
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
    if (
      spell == null &&
      (spellAddress.toHex() != '0x483574d869bc34d2131032e65a3114a901928e91' &&
        spellAddress.toHex() != '0xe7bbc8fea57a92fc307d650d78e5481b25ccedff')
    ) {
      spell = new Spell(spellAddress.toHexString())
      spell.timestamp = block.timestamp
      spell.approvals = BIGDECIMAL_ZERO
      spell.totalVotes = BIGINT_ZERO
      spell.timeLineCount = BIGINT_ZERO

      if (isDssSpellPaused(spellAddress)) {
        DssSpellPausedTemplate.create(spellAddress)

        // Update spells count
        governanceInfo.countSpells = governanceInfo.countSpells.plus(BIGINT_ONE)

        spell.save()
      } else {
        let dsSpell = DSSpell.bind(spellAddress)
        let dsResponse = dsSpell.try_whom()

        if (!dsResponse.reverted && isSaiMom(dsResponse.value)) {
          // Start traking this DS-Spell
          DSSpellTemplate.create(spellAddress)

          let spellData = dsSpell.data()
          spell.data = spellData

          // Update spells count
          governanceInfo.countSpells = governanceInfo.countSpells.plus(BIGINT_ONE)

          spell.save()
        } else if (dsResponse.reverted) {
          let raiseCeilingLowerSF = RaiseCeilingLowerSF.bind(spellAddress)
          let rclsfResponse = raiseCeilingLowerSF.try_MOM()

          log.warning('RaiseCeilingLowerSF try_MOM: {}.', [
            !rclsfResponse.reverted ? rclsfResponse.value.toHexString() : 'REVERTED',
          ])

          if (!rclsfResponse.reverted && isSaiMom(rclsfResponse.value)) {
            // Start traking this RaiseCeilingLowerSF
            RaiseCeilingLowerSFTemplate.create(spellAddress)

            // Update spells count
            governanceInfo.countSpells = governanceInfo.countSpells.plus(BIGINT_ONE)

            spell.save()
          }
        }
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
  let spellEntity = Spell.load(whom.toHexString())

  if (spellEntity !== null) {
    let dsChief = DSChief.bind(event.address)

    let approval = dsChief.approvals(whom)

    // How much MKR it has when the spell is lifted to hat
    spellEntity.lifted = event.block.timestamp
    spellEntity.liftedWith = fromBigIntToBigDecimal(approval)
    spellEntity.save()

    let governanceInfo = getGovernanceInfoEntity()
    governanceInfo.hat = whom
    governanceInfo.save()

    let action = new Action(
      'LIFT' + '-' + event.transaction.hash.toHex() + '-' + event.logIndex.toString(),
    )
    action.type = 'LIFT'
    action.sender = sender
    action.hat = whom
    action.block = event.block.number
    action.transactionHash = event.transaction.hash
    action.timestamp = event.block.timestamp
    action.save()

    updateGovernanceInfoEntity(event.block)
  } else {
    log.warning('handleLift: Spell with id {} not found.', [whom.toHexString()])
  }
}

function saveAddAction(
  yays: Bytes[],
  event: LogNote,
  locked: BigDecimal,
  id: string,
): void {
  let sender = event.params.guy

  for (let index = 0; index < yays.length; index++) {
    let yay = (yays as Bytes[])[index]
    if (yay !== null) {
      let spell = Spell.load(yay.toHexString())

      // there are some yays which are no spell
      if (spell !== null) {
        let actionId =
          id + '-' + event.transaction.hash.toHex() + '-' + event.logIndex.toString()
        let voteAction = new AddAction(actionId)
        voteAction.locked = locked
        voteAction.sender = sender
        voteAction.spell = yay.toHexString()
        voteAction.block = event.block.number
        voteAction.transactionHash = event.transaction.hash
        voteAction.timestamp = event.block.timestamp
        voteAction.save()

        spell.totalVotes = spell.totalVotes.plus(BIGINT_ONE)
        spell.approvals = spell.approvals.plus(locked)
        spell.timeLineCount = spell.timeLineCount.plus(BIGINT_ONE)
        spell.save()
      }
    }
  }
}

function saveRemoveAction(
  yays: Bytes[],
  event: LogNote,
  locked: BigDecimal,
  id: string,
): void {
  let sender = event.params.guy

  for (let index = 0; index < yays.length; index++) {
    let yay = (yays as Bytes[])[index]
    if (yay !== null) {
      let spell = Spell.load(yay.toHexString())

      // there are some yays which are no spell
      if (spell !== null) {
        let actionId =
          id + '-' + event.transaction.hash.toHex() + '-' + event.logIndex.toString()
        let voteAction = new RemoveAction(actionId)
        voteAction.locked = locked
        voteAction.sender = sender
        voteAction.spell = yay.toHexString()
        voteAction.block = event.block.number
        voteAction.transactionHash = event.transaction.hash
        voteAction.timestamp = event.block.timestamp
        voteAction.save()

        spell.approvals = spell.approvals.minus(locked)
        spell.totalVotes = spell.totalVotes.minus(BIGINT_ONE)
        spell.timeLineCount = spell.timeLineCount.plus(BIGINT_ONE)
        spell.save()
      }
    }
  }
}

function saveLockAction(
  yays: Bytes[],
  event: LogNote,
  locked: BigDecimal,
  id: string,
): void {
  let sender = event.params.guy

  for (let index = 0; index < yays.length; index++) {
    let yay = (yays as Bytes[])[index]
    if (yay !== null) {
      let spell = Spell.load(yay.toHexString())

      // there are some yays which are no spell
      if (spell !== null) {
        let actionId =
          id + '-' + event.transaction.hash.toHex() + '-' + event.logIndex.toString()
        let voteAction = new LockAction(actionId)
        voteAction.wad = locked

        voteAction.sender = sender
        voteAction.spell = yay.toHexString()
        voteAction.block = event.block.number
        voteAction.transactionHash = event.transaction.hash
        voteAction.timestamp = event.block.timestamp
        voteAction.save()

        spell.approvals = spell.approvals.plus(locked)
        spell.timeLineCount = spell.timeLineCount.plus(BIGINT_ONE)
        spell.save()
      }
    }
  }
}

function saveFreeAction(
  yays: Bytes[],
  event: LogNote,
  locked: BigDecimal,
  id: string,
): void {
  let sender = event.params.guy

  for (let index = 0; index < yays.length; index++) {
    let yay = (yays as Bytes[])[index]
    if (yay !== null) {
      let spell = Spell.load(yay.toHexString())

      // there are some yays which are no spell
      if (spell !== null) {
        let actionId =
          id + '-' + event.transaction.hash.toHex() + '-' + event.logIndex.toString()
        let voteAction = new FreeAction(actionId)
        voteAction.wad = locked

        voteAction.sender = sender
        voteAction.spell = yay.toHexString()
        voteAction.block = event.block.number
        voteAction.transactionHash = event.transaction.hash
        voteAction.timestamp = event.block.timestamp
        voteAction.save()

        spell.approvals = spell.approvals.minus(locked)
        spell.timeLineCount = spell.timeLineCount.plus(BIGINT_ONE)
        spell.save()
      }
    }
  }
}
