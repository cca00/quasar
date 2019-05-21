import { position, leftClick, listenOpts, prevent, stop, stopAndPrevent } from '../utils/event.js'
import { setObserver, removeObserver } from '../utils/touch-observer.js'
import { clearSelection } from '../utils/selection.js'

function getDirection (mod) {
  const
    none = mod.horizontal !== true && mod.vertical !== true,
    dir = {
      all: none === true || (mod.horizontal === true && mod.vertical === true)
    }

  if (mod.horizontal === true || none === true) {
    dir.horizontal = true
  }
  if (mod.vertical === true || none === true) {
    dir.vertical = true
  }

  return dir
}

function processChanges (evt, ctx, isFinal) {
  let
    pos = position(evt),
    direction,
    distX = pos.left - ctx.event.x,
    distY = pos.top - ctx.event.y,
    absDistX = Math.abs(distX),
    absDistY = Math.abs(distY)

  if (ctx.direction.horizontal && !ctx.direction.vertical) {
    direction = distX < 0 ? 'left' : 'right'
  }
  else if (!ctx.direction.horizontal && ctx.direction.vertical) {
    direction = distY < 0 ? 'up' : 'down'
  }
  else if (absDistX >= absDistY) {
    direction = distX < 0 ? 'left' : 'right'
  }
  else {
    direction = distY < 0 ? 'up' : 'down'
  }

  return {
    evt,
    position: pos,
    direction,
    isFirst: ctx.event.isFirst,
    isFinal: isFinal === true,
    isMouse: ctx.event.mouse,
    duration: new Date().getTime() - ctx.event.time,
    distance: {
      x: absDistX,
      y: absDistY
    },
    offset: {
      x: distX,
      y: distY
    },
    delta: {
      x: pos.left - ctx.event.lastX,
      y: pos.top - ctx.event.lastY
    }
  }
}

function shouldTrigger (ctx, changes) {
  if (ctx.direction.horizontal && ctx.direction.vertical) {
    return true
  }
  if (ctx.direction.horizontal && !ctx.direction.vertical) {
    return Math.abs(changes.delta.x) > 0
  }
  if (!ctx.direction.horizontal && ctx.direction.vertical) {
    return Math.abs(changes.delta.y) > 0
  }
}

const mouseEvtOpts = listenOpts.notPassiveCapture

export default {
  name: 'touch-pan',

  bind (el, binding) {
    const
      mouse = binding.modifiers.mouse === true,
      touchEvtCapture = binding.modifiers.capture === true ? { capture: true } : void 0,
      touchPassiveStr = binding.modifiers.mightPrevent !== true && binding.modifiers.prevent !== true
        ? 'passive'
        : 'notPassive',
      touchEvtOpts = listenOpts[touchPassiveStr + (touchEvtCapture !== void 0 ? 'Capture' : '')]

    function handleEvent (evt, mouseEvent) {
      if (mouse === true && mouseEvent === true) {
        stopAndPrevent(evt)
      }
      else {
        binding.modifiers.stop && stop(evt)
        binding.modifiers.prevent && prevent(evt)
      }
    }

    const ctx = {
      handler: binding.value,
      direction: getDirection(binding.modifiers),

      mouseStart (evt) {
        if (leftClick(evt)) {
          // stop propagation so possible upper v-touch-pan don't catch this as well
          binding.modifiers.mouseAllDir === true && stop(evt)

          document.addEventListener('mousemove', ctx.move, mouseEvtOpts)
          document.addEventListener('mouseup', ctx.mouseEnd, mouseEvtOpts)
          ctx.start(evt, true)
        }
      },

      mouseEnd (evt) {
        document.removeEventListener('mousemove', ctx.move, mouseEvtOpts)
        document.removeEventListener('mouseup', ctx.mouseEnd, mouseEvtOpts)
        ctx.end(evt)
      },

      start (evt, mouseEvent) {
        removeObserver(ctx)
        mouseEvent !== true && setObserver(el, evt, ctx)

        const pos = position(evt)

        ctx.event = {
          x: pos.left,
          y: pos.top,
          time: new Date().getTime(),
          mouse: mouseEvent === true,
          detected: false,
          abort: false,
          isFirst: true,
          isFinal: false,
          lastX: pos.left,
          lastY: pos.top
        }
      },

      move (evt) {
        if (ctx.event === void 0 || ctx.event.abort === true) {
          return
        }

        if (ctx.event.detected === true) {
          handleEvent(evt, ctx.event.mouse)

          const changes = processChanges(evt, ctx, false)

          if (
            (ctx.event.mouse === true && binding.modifiers.mouseAllDir === true) ||
            shouldTrigger(ctx, changes) === true
          ) {
            ctx.handler(changes)
            ctx.event.lastX = changes.position.left
            ctx.event.lastY = changes.position.top
            ctx.event.isFirst = false
          }

          return
        }

        const
          pos = position(evt),
          distX = Math.abs(pos.left - ctx.event.x),
          distY = Math.abs(pos.top - ctx.event.y)

        if (distX === distY) {
          return
        }

        ctx.event.detected = true

        if (
          ctx.direction.all === false &&
          (ctx.event.mouse === false || binding.modifiers.mouseAllDir !== true)
        ) {
          ctx.event.abort = ctx.direction.vertical
            ? distX > distY
            : distX < distY
        }

        if (ctx.event.abort !== true) {
          document.documentElement.style.cursor = 'grabbing'
          document.body.classList.add('no-pointer-events')
          document.body.classList.add('non-selectable')
          clearSelection()
        }

        ctx.move(evt)
      },

      end (evt) {
        if (ctx.event === void 0) {
          return
        }

        ctx.event.mouse !== true && removeObserver(ctx)

        document.documentElement.style.cursor = ''
        document.body.classList.remove('no-pointer-events')
        document.body.classList.remove('non-selectable')

        if (
          ctx.event.abort !== true &&
          ctx.event.detected === true &&
          ctx.event.isFirst !== true
        ) {
          handleEvent(evt, ctx.event.mouse)
          ctx.handler(processChanges(evt, ctx, true))
        }

        ctx.event = void 0
      }
    }

    if (el.__qtouchpan) {
      el.__qtouchpan_old = el.__qtouchpan
    }

    el.__qtouchpan = ctx

    if (mouse === true) {
      el.addEventListener(
        'mousedown',
        ctx.mouseStart,
        listenOpts[`notPassive${binding.modifiers.mouseCapture === true ? 'Capture' : ''}`]
      )
    }
    el.addEventListener('touchstart', ctx.start, touchEvtOpts)
    el.addEventListener('touchmove', ctx.move, touchEvtOpts)
    el.addEventListener('touchcancel', ctx.end, touchEvtCapture)
    el.addEventListener('touchend', ctx.end, touchEvtCapture)
  },

  update (el, { oldValue, value, modifiers }) {
    const ctx = el.__qtouchpan

    if (oldValue !== value) {
      ctx.handler = value
    }

    if (
      (modifiers.horizontal !== ctx.direction.horizontal) ||
      (modifiers.vertical !== ctx.direction.vertical)
    ) {
      ctx.direction = getDirection(modifiers)
    }
  },

  unbind (el, binding) {
    let ctx = el.__qtouchpan_old || el.__qtouchpan
    if (ctx !== void 0) {
      removeObserver(ctx)

      document.documentElement.style.cursor = ''
      document.body.classList.remove('no-pointer-events')
      document.body.classList.remove('non-selectable')

      const
        touchEvtCapture = binding.modifiers.capture === true ? { capture: true } : void 0,
        touchPassiveStr = binding.modifiers.mightPrevent !== true && binding.modifiers.prevent !== true
          ? 'passive'
          : 'notPassive',
        touchEvtOpts = listenOpts[touchPassiveStr + (touchEvtCapture !== void 0 ? 'Capture' : '')]

      if (binding.modifiers.mouse === true) {
        el.removeEventListener(
          'mousedown',
          ctx.mouseStart,
          listenOpts[`notPassive${binding.modifiers.mouseCapture === true ? 'Capture' : ''}`]
        )
        document.removeEventListener('mousemove', ctx.move, mouseEvtOpts)
        document.removeEventListener('mouseup', ctx.mouseEnd, mouseEvtOpts)
      }
      el.removeEventListener('touchstart', ctx.start, touchEvtOpts)
      el.removeEventListener('touchmove', ctx.move, touchEvtOpts)
      el.removeEventListener('touchcancel', ctx.end, touchEvtCapture)
      el.removeEventListener('touchend', ctx.end, touchEvtCapture)

      delete el[el.__qtouchpan_old ? '__qtouchpan_old' : '__qtouchpan']
    }
  }
}
