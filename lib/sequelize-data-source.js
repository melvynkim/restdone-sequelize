/**
 * Created by melvynkim on 09/02/15.
 */
'use strict';

var _ = require('lodash');
var HTTP_STATUSES = require('http-status-node');


class SequelizeDataSource {
  constructor(ModelClass) {
    this.ModelClass = ModelClass;

    this.defaultIdField = 'id';
    this.defaultArrayMethods = ['$addToSet', '$pop', '$push', '$pull'];
  }

  initialize (options) {
    this.idField = options.idField;
    this.fieldMap = options.fieldMap || {};
    this.modelFieldNames = options.modelFieldNames;
  }

  find(options) {
    var filter = options.filter;
    var fields = options.fields;
    var q = options.q;
    var qFields = options.qFields;
    var sort = options.sort;
    var limit = parseInt(options.limit, 10);
    var skip = parseInt(options.skip, 10);
    var queryPipe = options.queryPipe;

    this._normalizeFilter(filter, this.ModelClass);
    this._applyQ(q, qFields, filter);
    var query = {};

    query.attributes = this._normalizeFields(fields, filter, query);

    query.where = filter;

    if (sort) {
      query.order = [];
      _.forOwn(sort, (value, key) => {
        query.order.push([key, +value > 0 ? 'ASC' : 'DESC']);
      });
      //query.order = sort;
    }
    query.limit = limit;
    if (skip > 0) {
      query.offset = skip;
    }
    if (queryPipe) {
      queryPipe(query);
    }

    return this.ModelClass
      .findAll(query)
      .then((docs) => {
        return _.map(docs, (doc) => {
          return this.toObject(doc);
        });
      });
  }

  findOne(options) {
    var filter = options.filter;
    var fields = options.fields;
    var queryPipe = options.queryPipe;

    this._normalizeFilter(filter, this.ModelClass);

    var query = {};

    query.attributes = this._normalizeFields(fields, filter, query);

    query.where = filter;

    if (queryPipe) {
      queryPipe(query);
    }
    return this.ModelClass.findOne(query);
  }

  create(data) {
    return this.ModelClass.build(data);
  }

  save(doc) {
    return doc
      .save()
      .then((newDoc) => {
        var where = {};
        where[this.idField] = newDoc[this.idField];
        return this.findOne({filter: where, fields: this.fieldMap});
      });
  }

  remove(doc) {
    return doc
      .destroy()
      .then(() => {
        return doc;
      });
  }

  count(options) {
    var filter = options.filter;
    var q = options.q;
    var qFields = options.qFields;


    this._normalizeFilter(filter, this.ModelClass);
    this._applyQ(q, qFields, filter);

    var query = {};
    this._normalizeFields(this.modelFieldNames || this.getModelFieldNames(), filter, query); // for filtering by associations
    query.where = filter;

    query.limit = 1;
    // distinct allows `findAndCountAll` method to work correctly when query with associations
    query.distinct = true;

    // return this.ModelClass.count(query); -- count shows wrong results in some complex cases.
    return this.ModelClass
      .findAndCountAll(query)
      .then((result) => {
        return result.count;
      });
  }

  toObject(model) {
    return model.get({
      plain: true
    });
  }

  getFieldValue(model, fieldName) {
    return this._resolveProp(model, fieldName);
  }

  setFieldValue(model, fieldName, value) {
    this._setProp(model, fieldName, value);
  }

  proceedArrayMethod(source, methodName, fieldName, scope) {
    // TODO: Implement
    //// get sure we have an array
    //if (dest[fieldName] === undefined) {
    //  dest[fieldName] = [];
    //}
    //
    //if (methodName === '$addToSet') {
    //  dest[fieldName].addToSet(source);
    //} else if (methodName === '$pop') {
    //  if (source === 1) {
    //    dest[fieldName].pop();
    //  } else if (source === -1) {
    //    dest[fieldName].shift();
    //  } else {
    //    throw new Error('Illegal param value for $pop method');
    //  }
    //} else if (methodName === '$push') {
    //  dest[fieldName].push(source);
    //} else if (methodName === '$pull') {
    //  dest[fieldName].pull(source);
    //}
  }

  assignField(fieldName, scope) {
    var dest = scope.model;
    var source = scope.source;
    dest.set(fieldName, source[fieldName]);
  }

  getModelFieldNames() {
    return _.keys(this.ModelClass.rawAttributes);
  }

  parseError(err) {
    // TODO: Implement
    var result = {};
    if (err.name === 'SequelizeValidationError') {
      result.status = HTTP_STATUSES.BAD_REQUEST;
      result.details = err.errors;
    } else if (err.name === 'SequelizeUniqueConstraintError') {
      result.status = HTTP_STATUSES.BAD_REQUEST;
      result.message = err.message;
      result.details = {};
      _.each(err.errors, (error) => {
        result.details[error.path] = {path: error.path, type: error.type, value: error.value, message: error.message};
      });

      result.details = err.errors;
    }
    //else if (err.name == 'CastError') {
    //  result.status = HTTP_STATUSES.BAD_REQUEST;
    //  result.details = {};
    //  result.details[err.path] = {
    //    message: err.message,
    //    name: err.name,
    //    path: err.path,
    //    type: err.type,
    //    value: err.value
    //  };
    //  result.message = 'CastError';
    //}
    //else if (err.name == 'MongoError' && (err.code == 11000 || err.code == 11001)) { // E11000(1) duplicate key error index
    //  result.status = HTTP_STATUSES.BAD_REQUEST;
    //  result.details = err.err;
    //}
    //else if (err.name == 'VersionError') {
    //  result.status = HTTP_STATUSES.CONFLICT;
    //  result.details = err.message;
    //} else {
    //  return;
    //}
    else {
      // it's just for testing
      result.status = HTTP_STATUSES.BAD_REQUEST;
      result.details = err.message;
    }

    return result;
  }

  _applyQ(q, qFields, filter) {
    var qExpr = q ? this._buildQ(qFields, q) : undefined;
    if (!_.isUndefined(qExpr) && qExpr.length > 0) {
      filter.$or = qExpr;
    }
  }

  _buildQ(qFields, q) {
    return _.map(qFields, (field) => {
      var result = {};
      result[field] = { $like: '%' + q + '%' };
      return result;
    });
  }

  /**
   * @param fields
   * @param filter
   * @param query
   * @param filterDriven if set, `include`s will be created for filtered values only
   * @returns {*}
   * @private
   */
  _normalizeFields(fields, filter, query, filterDriven) {
    query.include = query.include || [];
    fields = this._resolveAssociations(this.ModelClass, this.fieldMap, fields, filter, query.include, filterDriven);

    if (!filterDriven && fields.indexOf(this.ModelClass.primaryKeyField) < 0) {
      fields.push(this.ModelClass.primaryKeyField);
    }

    return fields;
  }

  _resolveAssociations(ModelClass, fieldMap, fields, filter, include, filterDriven) {
    include = include || [];
    var fieldsToRemove = [];
    var filterToRemove = [];
    var result = _.map(fields, (field) => {
      var isObject = typeof(field) === 'object';
      var fieldName = isObject ? field.name : field;
      var fieldMeta = fieldMap && fieldMap[fieldName];
      var association = ModelClass.associations[fieldName];
      if (fieldMeta && association) {
        if (!filterDriven) {
          fieldsToRemove.push(fieldName);
        }

        var associationFields;
        var required;
        if (isObject && field.fields) {
          associationFields = field.fields;
          required = field.required;
        } else if (fieldMeta.fields) {
          associationFields = fieldMeta.fields;
          required = fieldMeta.required;
        } else {
          // TODO: Fix. It will ignore `required`, if no fields provided
          associationFields = [association.targetKey];
          required = undefined;
        }

        var filterValue = filter ? filter[fieldName] : undefined;

        var nestedInclude = [];

        associationFields = this._resolveAssociations(association.target, fieldMeta.fields, associationFields, filterValue, nestedInclude, filterDriven);

        var cleanFilterValue = filterValue ? _.transform(filterValue, (result, value, key) => {
          if (associationFields.indexOf(key) >= 0) {
            result[key] = value;
          } else if (key === '$$') {
            _.assign(result, value);
          }
          return result;
        }) : undefined;

        if (cleanFilterValue) {
          filterToRemove.push(fieldName);
        }

        if (!filterDriven || cleanFilterValue) {
          // put to include
          include.push({
            association: association,
            attributes: associationFields,
            include: nestedInclude,
            required: required,
            where: cleanFilterValue
          });
        }
      }
      return fieldName;
    });

    if (!filterDriven) {
      _.each(fieldsToRemove, (field) => {
        _.pull(result, field);
      });
    }

    _.each(filterToRemove, (filterItem) => {
      delete filter[filterItem];
    });

    return result;
  }

  _normalizeFilter(filter, root) {
    // TODO: Implement
    //_.forEach(_.keys(filter), function (key) {
    //  var path = root.schema.paths[key];
    //  // if it's an operator
    //  if (key.substr(0, 1) === '$') {
    //    // increase the level without changing the root
    //    this._normalizeFilter(filter[key], root);
    //  } else if (path) {
    //    var typeName = path.options.type.name;
    //    // it's embedded document
    //    if (!_.isUndefined(path.schema)) {
    //      this._normalizeFilter(filter[key], root.schema.paths[key]);
    //    } else if (typeName === 'ObjectId') {
    //      if (typeof(filter[key]) === 'string') {
    //        filter[key] = ObjectID(filter[key]);
    //      }
    //    } else if (typeName === 'Date') {
    //      if (typeof(filter[key]) === 'string') {
    //        filter[key] = new Date(filter[key]);
    //      }
    //      else if (typeof(filter[key]) === 'object') {
    //        _.forOwn(filter[key], function (value, innerKey) {
    //          if (typeof(value) === 'string') {
    //            filter[key][innerKey] = new Date(value);
    //          }
    //        });
    //      }
    //    }
    //  }
    //}, this);
  }

  _resolveProp(obj, stringPath) {
    stringPath = stringPath.replace(/\[(\w+)]/g, '.$1');  // convert indexes to properties
    stringPath = stringPath.replace(/^\./, '');           // strip a leading dot
    var pathArray = stringPath.split('.');
    while (pathArray.length) {
      var pathItem = pathArray.shift();
      if (pathItem in obj) {
        obj = obj[pathItem];
      } else {
        return;
      }
    }
    return obj;
  }

  _setProp(obj, stringPath, value) {
    stringPath = stringPath.replace(/\[(\w+)]/g, '.$1');  // convert indexes to properties
    stringPath = stringPath.replace(/^\./, '');           // strip a leading dot
    var pathArray = stringPath.split('.');
    while (pathArray.length - 1) {
      var pathItem = pathArray.shift();
      if (pathItem in obj) {
        obj = obj[pathItem];
      } else {
        return;
      }
    }
    return obj[pathArray.length ? pathArray[0] : stringPath] = value;
  }
}

module.exports = SequelizeDataSource;
