import React, {Component} from 'react';
import QuadrantContainer from '../Quadrant/QuadrantContainer';
import CanvasOverlay from './CanvasOverlay';
import './Canvas.scss';
import addConnection from 'actions/Connection/add';
import removeConnection from 'actions/Connection/remove';
import moveConnection from 'actions/Connection/move';
import Connection from 'stores/Connection';
import toggleHighlight from 'actions/CanvasElements/toggleHighlight';

export default class Canvas extends Component {
  constructor(props) {
    super(props);

    this.state = {
      lastUpdate: new Date(),
      canvasHeight: null,
      connections: []
    };

    this.fulfilledAction = null;
    this.fulfilledActionOnMove = null;
    this.fulfilledActionOnMoveStatus = null;

    this.connectionsChanged = () => {
      this.setState({connections: Connection.getData()});
    }
  }

  componentWillMount() {
    this.repaint = setInterval(() => {
      this.paper.repaintEverything();
    }, 50);

    Connection.addChangeListener(this.connectionsChanged);
  }

  componentDidMount() {
    this.paper = jsPlumb.getInstance({
      DragOptions: {cursor: 'pointer', zIndex: 2000},
      PaintStyle: {
        strokeStyle: '#ffffff',
        lineWidth: 6
      },
      Connector: ['Bezier', {curviness: 40}],
      Container: 'canvas',
      ConnectionOverlays: [
        ['Label',
          {
            label: 'X',
            id: 'remove-button',
            cssClass: 'remove-button'
          }
        ]
      ],
      Anchors: [0.5, 0, 0.5, 0.5]
    });

    LunchBadgerCore.utils.paper = this.paper;

    this._attachPaperEvents();
    this._registerConnectionTypes();

    jsPlumb.fire('canvasLoaded', this.paper);
  }

  componentWillUnmount() {
    clearInterval(this.repaint);

    Connection.removeChangeListener(this.connectionsChanged);
  }

  _disconnect(connection) {
    this.paper.detach(connection, {
      fireEvent: false
    });

    removeConnection(connection.sourceId, connection.targetId);
  }

  _flipConnection(info) {
    this.paper.connect({
      source: info.target,
      target: info.source
    });
  }

  _isConnectionValid(source, sourceId, target, targetId) {
    if (sourceId === targetId) {
      return false;
    }

    if ((source.parentElement.classList.contains('port-in') && target.parentElement.classList.contains('port-in')) ||
      (source.parentElement.classList.contains('port-out') && target.parentElement.classList.contains('port-out'))) {
      return false;
    }

    return true;
  }

  _registerConnectionTypes() {
    this.paper.registerConnectionTypes({
      'wip': {
        cssClass: 'loading',
        detachable: false
      }
    });
  }

  _checkStrategyOnMove(oldsourceId, oldTargetId, sourceId, targetId) {
    this.fulfilledActionOnMove = null;
    this.fulfilledActionOnMoveStatus = null;

    let strategyFulfilled = null;

    this.props.plugins.getConnectionCreatedStrategies().forEach((strategy) => {
      if (strategyFulfilled === null) {
        const fulfilledStatus = strategy.handleConnectionMoved.checkAction(oldsourceId, oldTargetId, sourceId, targetId);

        if (fulfilledStatus !== null) {
          strategyFulfilled = fulfilledStatus;
        }

        if (fulfilledStatus) {
          this.fulfilledActionOnMove = strategy.handleConnectionMoved.fulfilledAction;
        }
      }
    });

    this.fulfilledActionOnMoveStatus = strategyFulfilled;

    return strategyFulfilled;
  }

  _checkStrategyOnCreate(sourceId, targetId) {
    this.fulfilledAction = null;
    let strategyFulfilled = null;

    this.props.plugins.getConnectionCreatedStrategies().forEach((strategy) => {
      if (strategyFulfilled === null) {
        const fulfilledStatus = strategy.handleConnectionCreated.checkAction(sourceId, targetId);

        if (fulfilledStatus !== null) {
          strategyFulfilled = fulfilledStatus;
        }

        if (fulfilledStatus) {
          this.fulfilledAction = strategy.handleConnectionCreated.fulfilledAction;
        }
      }
    });

    return strategyFulfilled;
  }

  _attachPaperEvents() {
    this.paper.bind('connection', (info) => {
      const {source, target, sourceId, targetId, connection} = info;

      if (source.parentElement.classList.contains('port-in')) {
        this._flipConnection(info);
        this._disconnect(connection);

        return;
      }

      if (Connection.findEntityIndexBySourceAndTarget(sourceId, targetId) < 0 && !connection.suspendedElement) {
        if (!this.fulfilledAction) {
          addConnection(sourceId, targetId, info);
        } else {
          this.fulfilledAction(info);
        }
      } else if (connection.suspendedElement && !this.fulfilledActionOnMove && this.fulfilledActionOnMoveStatus !== null) {
        this._disconnect(connection);

        if (connection.suspendedElementType === 'target') {
          this.paper.connect({
            source: source,
            target: connection.suspendedElement
          }, {
            fireEvent: false
          });
        } else {
          this.paper.connect({
            source: connection.suspendedElement,
            target: target
          }, {
            fireEvent: false
          });
        }
      }

      this.fulfilledAction = null;
      this.fulfilledActionOnMove = null;
      this.fulfilledActionOnMoveStatus = null;
    });

    this.paper.bind('connectionMoved', (info) => {
      const check = this._checkStrategyOnMove(info.originalSourceId, info.originalTargetId, info.newSourceId, info.newTargetId);

      if (!this.fulfilledActionOnMove && check === null) {
        moveConnection(info.originalSourceId, info.originalTargetId, info.newSourceId, info.newTargetId, info);
      } else if (check) {
        this.fulfilledActionOnMove(info);
      }
    });

    this.paper.bind('connectionDetached', (info) => {
      this.paper.connect({
        source: info.source,
        target: info.target
      });
    });

    this.paper.bind('beforeDrop', (info) => {
      const {sourceId, targetId, connection} = info;

      const sourceElement = document.querySelector(`#${sourceId}`);
      const targetElement = document.querySelector(`#${targetId}`);

      if (!this._isConnectionValid(sourceElement, sourceId, targetElement, targetId)) {
        return false;
      }

      // connection is being moved...
      if (connection.suspendedElement) {
        return true;
      } else {
        if (sourceElement.parentElement.classList.contains('port-in')) {
          return this._checkStrategyOnCreate(targetId, sourceId) !== false;
        } else {
          return this._checkStrategyOnCreate(sourceId, targetId) !== false;
        }
      }
    });

    this.paper.bind('beforeDrag', () => {
      return true;
    });

    this.paper.bind('connectionAborted', () => {
      return true;
    });

    this.paper.bind('click', (connection, event) => {
      if (event.target.classList.contains('remove-button')) {
        this._disconnect(connection);
      }
    });
  }

  render() {
    let {canvasHeight} = this.state;

    if (!this.props.appState.getStateKey('currentlyOpenedPanel')) {
      canvasHeight = null;
    }

    const panelEditingStatus = this.props.appState.getStateKey('panelEditingStatus');

    return (
      <section className="canvas"
               onClick={() => !panelEditingStatus && this.props.appState.getStateKey('currentElement') && toggleHighlight(null)}>
        {panelEditingStatus && <CanvasOverlay appState={this.props.appState}/> }
        <div style={{height: canvasHeight}} className="canvas__wrapper">
          <div style={{height: canvasHeight}} className="canvas__legend">
            <div className="canvas__label canvas__label--left">Producers</div>
            <div className="canvas__label canvas__label--right">Consumers</div>
          </div>

          <QuadrantContainer appState={this.props.appState}
                             plugins={this.props.plugins}
                             paper={this.paper}
                             connections={this.state.connections}
                             style={{minHeight: canvasHeight}}
                             className="canvas__container" id="canvas"/>
        </div>
      </section>
    );
  }
}
