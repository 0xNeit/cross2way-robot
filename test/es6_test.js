class B {
  constructor(c) {
    console.log('B')
  }
}

class A extends B {
  constructor(c) {
    console.log('A begin')
    super(c)
    Object.assign(this, c)
    console.log('A end')
  }
}

const a = new A({a: 1, b: 2})

const [host, port] = '12.3.4.5:88'.split(':')
console.log(`hello world, a = ${a.a}, b = ${a.b}, host=${host}, port=${port}`)