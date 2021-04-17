[![NPM](https://nodei.co/npm/restdone-sequelize.png?compact=true)](https://npmjs.org/package/restdone-sequelize)

Sequelize Data Source for Restdone
==========

Restdone - simplify RESTful service

https://github.com/melvynkim/restdone

# Usage Example

```
  SequelizeDataSource = require('restdone-sequelize'),
  User = sequelize.model('User'),

...

module.exports = BaseController.extend({
  dataSource: new SequelizeDataSource(User),
...

```

# Issues

https://github.com/melvynkim/restdone-sequelize/issues