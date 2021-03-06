import APIInterceptor from '../utils/APIInterceptor';
import {bindParams} from '../utils/URLParamsBind';

export default class ProjectService {
  constructor(apiUrl) {
    this._APIHandle = new APIInterceptor(apiUrl);
  }

  get(producerId, envId) {
    return this._APIHandle.get(bindParams(
      'producers/:producerId/envs/:envId/files/:envId/project.json', {producerId, envId}));
  }

  save(producerId, envId, data, rev) {
    let req = {
      body: {
        [envId + '/project.json']: JSON.stringify(data, null, '  ')
      }
    };

    if (rev) {
      req.headers = {
        'If-Match': rev
      };
    }
    return this._APIHandle.patch(bindParams(
        'producers/:producerId/envs/:envId/files', {producerId, envId}), req);
  }
}
