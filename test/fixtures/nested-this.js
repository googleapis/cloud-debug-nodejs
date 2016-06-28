function obj ( ) {
  this.k = true;
  this.j = function ( ) {
    this.k = false;

    return this.k;
  };

  this.j.bind({})();
  return this.j;
}

module.exports = obj;