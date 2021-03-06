import React, { useState, useEffect } from 'react'
import {
  DragDropContext,
  DropResult,
  ResponderProvided,
  Droppable,
  DroppableProvided,
  DraggableLocation,
} from 'react-beautiful-dnd'
import { CommandItem, Commands, CommandDirection } from './DraggableCommands'
import { sizingUnit } from './theme'
import { PlayStopIcon } from './PlayStopIcon'
import { Control } from './ControlCommand'
import { setSpeed, sendCommand } from './DroneService'
import { WebRTC } from './WebRTC'

async function wait(seconds: number) {
  return new Promise(resolve => {
    setTimeout(resolve, seconds * 1000)
  })
}

const reorder = (
  list: CommandItem[],
  startIndex: number,
  endIndex: number
): CommandItem[] => {
  const result = [...list]
  const [removed] = result.splice(startIndex, 1)
  result.splice(endIndex, 0, removed)

  return result
}

const move = ({
  source,
  destination,
  droppableSource,
  droppableDestination,
}: {
  source: CommandItem[]
  destination: CommandItem[]
  droppableSource: DraggableLocation
  droppableDestination: DraggableLocation
}) => {
  const sourceClone = [...source]
  const destClone = [...destination]
  const [removed] = sourceClone.splice(droppableSource.index, 1)

  destClone.splice(droppableDestination.index, 0, removed)

  return { source: sourceClone, destination: destClone }
}

function fillMissingCommands(commandList: CommandItem[]): CommandItem[] {
  const commands = commandList.slice()

  initialCommands.map(command => {
    const commandIsAvailable = commands.find(
      availableCommand => availableCommand.action === command.action
    )
    if (!commandIsAvailable) {
      if (command.action === 'takeoff' || command.action === 'land') {
        commands.push(createControlledCommand(command.action))
      } else {
        commands.push(createDirectedCommand(command.action))
      }
    }
  })

  return commands
}

let commandIdx = 0

function createDirectedCommand(direction: CommandDirection): CommandItem {
  return {
    action: direction,
    id: `${commandIdx++}-command`,
    speed: 10,
    distance: 20,
  }
}

function createControlledCommand(action: Control): CommandItem {
  return {
    action,
    id: `${commandIdx++}-command`,
  }
}

const initialCommands: CommandItem[] = [
  createControlledCommand('takeoff'),
  createControlledCommand('land'),
  createDirectedCommand('up'),
  createDirectedCommand('down'),
  createDirectedCommand('right'),
  createDirectedCommand('left'),
  createDirectedCommand('forward'),
  createDirectedCommand('back'),
]

export function CommandBoard() {
  const [queuedCommands, setQueuedCommands] = useState<CommandItem[]>([])
  const [availableCommands, setAvailableCommands] = useState(initialCommands)
  const [firstItemTimeLeft, setFirstItemTimeLeft] = useState(1)

  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    playCommands(queuedCommands)
  }, [isPlaying])

  function playCommands(commands: CommandItem[]) {
    async function executeCommand() {
      if (!isPlaying) {
        return
      }
      if (commands.length === 0) {
        setIsPlaying(false)
        return
      }
      const currentCommand = commands[0]
      if (currentCommand) {
        const { speed, distance, action } = currentCommand as any
        setFirstItemTimeLeft(1)
        if (speed) {
          setSpeed(speed)
          await wait(2)
          sendCommand(`${action} ${distance}`)
          const totalDuration = distance / speed
          let secondsSpent = 0
          while (secondsSpent <= totalDuration) {
            setFirstItemTimeLeft(1 - secondsSpent / totalDuration)
            secondsSpent++
            await wait(1)
          }
        } else {
          sendCommand(action)
          const totalDuration = 8
          let secondsSpent = 0
          while (secondsSpent <= totalDuration) {
            setFirstItemTimeLeft(1 - secondsSpent / totalDuration)
            secondsSpent++
            await wait(1)
          }
        }
      }

      const newCommands = commands.splice(1)
      setQueuedCommands(newCommands)
      playCommands(newCommands)
    }
    executeCommand()
  }

  function handleSetSpeed(commandId: string, speed: number) {
    const availableClone = availableCommands.slice()
    const availableIdx = availableClone.findIndex(command => command.id === commandId)
    if (availableIdx >= 0) {
      ;(availableCommands[availableIdx] as any).speed = speed

      setAvailableCommands(availableClone)
    } else {
      const queuedClone = queuedCommands.slice()

      const queuedIdx = queuedClone.findIndex(command => command.id === commandId)
      if (queuedIdx < 0) {
        throw new Error(`Cannot find command by id ${commandId}`)
      }
      ;(queuedClone[queuedIdx] as any).speed = speed
      setQueuedCommands(queuedClone)
    }
  }

  function handleSetDistance(commandId: string, distance: number) {
    const availableClone = availableCommands.slice()
    const availableIdx = availableClone.findIndex(command => command.id === commandId)
    if (availableIdx >= 0) {
      ;(availableCommands[availableIdx] as any).distance = distance
      setAvailableCommands(availableClone)
    } else {
      const queuedClone = queuedCommands.slice()

      const queuedIdx = queuedClone.findIndex(command => command.id === commandId)
      if (queuedIdx < 0) {
        throw new Error(`Cannot find command by id ${commandId}`)
      }
      ;(queuedClone[queuedIdx] as any).distance = distance
      setQueuedCommands(queuedClone)
    }
  }

  function onDragEnd(result: DropResult, provided: ResponderProvided) {
    const { source, destination } = result

    if (!destination) {
      return
    }

    if (source.droppableId === destination.droppableId) {
      if (source.droppableId === 'commands') {
        const items = reorder(availableCommands, source.index, destination.index)
        setAvailableCommands(items)
      } else if (source.droppableId === 'queuedCommands') {
        const items = reorder(queuedCommands, source.index, destination.index)
        setQueuedCommands(items)
      }
    } else {
      if (source.droppableId === 'commands') {
        const resultFromMove = move({
          source: availableCommands,
          destination: queuedCommands,
          droppableSource: source,
          droppableDestination: destination,
        })

        const filledCommands = fillMissingCommands(resultFromMove.source)

        setAvailableCommands(filledCommands)
        setQueuedCommands(resultFromMove.destination)
      } else {
        const resultFromMove = move({
          source: queuedCommands,
          destination: availableCommands,
          droppableSource: source,
          droppableDestination: destination,
        })
        setAvailableCommands(resultFromMove.destination)
        setQueuedCommands(resultFromMove.source)
      }
    }
  }

  return (
    <div
      style={{
        height: '100vh',
        display: 'grid',
        gridTemplateAreas: `'queue video'
                            'queue commands'`,
        gridTemplateColumns: '1fr 4fr',
        gridTemplateRows: 'minmax(0, 2fr) minmax(0, 1fr)',
      }}
    >
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="queuedCommands">
          {(provided: DroppableProvided) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              style={{
                overflowY: 'scroll',
                gridArea: 'queue',
                position: 'relative',
              }}
            >
              <div
                style={{
                  height: '4rem',
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'center',
                  margin: `${sizingUnit}px 0`,
                }}
              >
                <PlayStopIcon
                  onClick={() => setIsPlaying(prevIsPlaying => !prevIsPlaying)}
                  isPlaying={isPlaying}
                />
              </div>
              <div ref={provided.innerRef} {...provided.droppableProps}>
                <Commands
                  firstItemTimeLeft={firstItemTimeLeft}
                  direction="column"
                  list={queuedCommands}
                  onSetDistance={handleSetDistance}
                  onSetSpeed={handleSetSpeed}
                />
              </div>
              {provided.placeholder}
            </div>
          )}
        </Droppable>
        <WebRTC />
        <Droppable droppableId="commands" direction="horizontal">
          {(provided: DroppableProvided) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              style={{ gridArea: 'commands', overflowX: 'auto' }}
            >
              <Commands
                firstItemTimeLeft={1}
                direction="row"
                list={availableCommands}
                onSetDistance={handleSetDistance}
                onSetSpeed={handleSetSpeed}
              />
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  )
}
