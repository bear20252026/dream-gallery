import type { Locale } from '../engine/save'

/**
 * Everything the hill has to say. The player is the pilot whose little aeroplane came down on this
 * summit; the things living here speak in short, quiet lines. `chooseScript` is pure (unit tested):
 * the encounter layer owns the state and applies the returned effects.
 */

/** '' = narration (no name shown). */
export type Speaker = '' | 'fox' | 'rose' | 'sheep' | 'tapir' | 'shoebill' | 'you'
export type Line = readonly [Speaker, string]
export type Target = 'plane' | 'hat' | 'sprout' | 'fox' | 'rose' | 'sheep' | 'box' | 'tapir' | 'shoebill' | 'guardian'
export type StarId = Target
/** Order of the ten stars in the HUD. */
export const STARS: readonly StarId[] = ['plane', 'fox', 'rose', 'sheep', 'box', 'sprout', 'hat', 'tapir', 'shoebill', 'guardian']
export const FOX_TAMED = 3
/** Scripts write the player's name as this token; the UI swaps the real name in when a talk opens. */
export const NAME_TOKEN = '{name}'
export function personalize(text: string, name: string): string {
  return text.split(NAME_TOKEN).join(name)
}

export type Book = {
  plane: { first: Line[]; again: Line[][] }
  hat: { first: Line[]; again: Line[][] }
  sprout: { first: Line[]; more: Line[]; last: Line[] }
  fox: { meet: [Line[], Line[], Line[]]; tamed: Line[][] }
  rose: { first: Line[]; again: Line[][]; fox: Line[] }
  sheep: { first: Line[]; again: Line[][] }
  box: { first: Line[]; again: Line[][] }
  tapir: { first: Line[]; again: Line[][] }
  shoebill: { first: Line[]; again: Line[][] }
  guardian: { first: Line[]; again: Line[][]; awake: Line[]; after: Line[][] }
}

const zh: Book = {
  plane: {
    first: [
      ['', '这是你的飞机。它一头扎进草里，像在闻泥土的味道。'],
      ['', '一片螺旋桨弯了，发动机里还卡着一小团云。'],
      ['', '水壶里的水，还够喝好几天。修好它要花很久——可是今天，你一点也不着急。'],
    ],
    again: [
      [['', '你拧紧一颗螺丝。飞机好像轻轻叹了一口气。']],
      [['', '你在机翼上画了一只羊，端详了半天，又擦掉了——这只看起来病恹恹的。']],
      [['', '于是你画了一只箱子，在侧面钻了三个小孔。这样好多了。']],
      [['', '远处的云正在慢慢改变形状。你决定，发动机的事，明天再说。']],
    ],
  },
  hat: {
    first: [
      ['', '一块形状古怪的石头：一头低，一头高，中间鼓起一个大包。'],
      ['', '路过的大人们都说：“这是一顶帽子。”'],
      ['', '可你一眼就看出来了：这是一条蟒蛇，刚刚吞下一头大象，正在慢慢消化。'],
      ['you', '……还是别跟大人们解释了。'],
    ],
    again: [
      [['', '蟒蛇还在消化。看样子，还要好几个月。']],
      [['', '你把耳朵贴在石头上。里面好像有一头大象，在很小声地打呼噜。']],
    ],
  },
  sprout: {
    first: [
      ['', '草丛里冒出一棵小芽，顶着两片圆圆的叶子。'],
      ['', '这是猴面包树的芽。它们还小的时候，和玫瑰的芽几乎一模一样。'],
      ['', '你把它连根拔了起来。要是等它长大，它的根会把整座山撑裂。'],
    ],
    more: [['', '又拔掉一棵。这件事很枯燥，可是很要紧。']],
    last: [
      ['', '今天的猴面包树芽，都拔完了。'],
      ['', '明天早上，它们还会再冒出来。每天都要记得。'],
    ],
  },
  fox: {
    meet: [
      [
        ['fox', '站住。再往前一步，我就要跑了。'],
        ['you', '我不会伤害你。我叫{name}。'],
        ['fox', '{name}……我知道你不会。可是，光知道名字，还不算认识。'],
        ['fox', '在这座山上，你只是一个路过的人；我呢，只是草丛里的一团橘色。'],
        ['fox', '要是你愿意常来，每次都坐得近一点……'],
        ['fox', '也许有一天，我能从风声里，分辨出你的脚步声。'],
        ['fox', '今天就到这里。下次，你可以离我近一点。'],
      ],
      [
        ['fox', '你又来了，{name}。'],
        ['fox', '你知道吗？刚才云还没飘过来，我就开始高兴了。'],
        ['fox', '越接近你来的时候，我越坐不住，尾巴一直在扫草。'],
        ['fox', '所以，最好有一个约定的时刻。不然，我不知道该什么时候开始准备我的心情。'],
        ['fox', '去吧。下次，再近一点。'],
      ],
      [
        ['fox', '我不吃面包，也不看云。云对我来说，本来没有什么意思。'],
        ['fox', '可是那条红丝带……以后每次看见它在风里飘，我就会想起你。'],
        ['fox', '我还会喜欢上风吹过草坡的声音。'],
        ['fox', '好了，{name}。你已经驯养了我。'],
        ['fox', '从现在起，你走到哪里，我就跟到哪里。'],
      ],
    ],
    tamed: [
      [
        ['fox', '告诉你一个秘密：要闭上眼睛，才看得清最要紧的东西。'],
        ['fox', '就像现在，我闭着眼睛，也知道是{name}来了。'],
      ],
      [['fox', '你为我花掉的那些时间，让我变得和别的狐狸都不一样了。']],
      [['fox', '别忘了，{name}，是你驯养了我。这件事，你要一直负责。']],
      [['fox', '你在看云吗，{name}？我在看你看云。']],
      [['fox', '玫瑰那里的风最小。守护者的手，一直替她挡着呢。']],
      [['fox', '今天的风，闻起来有一点甜。']],
    ],
  },
  rose: {
    first: [
      ['', '守护者搁在草地上的那只大手边，开着一朵红玫瑰，罩在一只玻璃罩里。'],
      ['', '你轻轻掀起玻璃罩。'],
      ['rose', '啊，你终于来了。我刚刚睡醒，花瓣还没理好呢。'],
      ['you', '你好，我叫{name}。'],
      ['rose', '{name}。好名字——不过，当然没有“玫瑰”好听。'],
      ['rose', '看见我的刺了吗？一、二、三、四。我可一点都不害怕。'],
      ['rose', '……不过风有一点凉。你走的时候，记得替我把罩子放回来。'],
    ],
    again: [
      [['rose', '那个大个子每天都替我挡风。它从来不说话，可我知道，它在听。']],
      [['rose', '你不必天天来看我，{name}。……可如果你来了，我会很高兴。']],
      [['rose', '我才不需要什么屏风。我只是……有一点点怕冷。']],
      [['rose', '你以为世上有很多玫瑰吗？也许吧。可是被你掀开过罩子的，只有我一朵。']],
    ],
    fox: [['rose', '{name}，你身上有狐狸的味道。看来，你也驯养了什么。']],
  },
  sheep: {
    first: [
      ['sheep', '咩——'],
      ['', '一只毛蓬蓬的小羊，正认认真真地嚼着一根草。'],
      ['', '它看了看玫瑰，又看了看你。'],
      ['you', '……不许吃她。'],
      ['sheep', '咩。'],
    ],
    again: [
      [['', '你想起来，应该给它画一个嘴套。可是你忘了画系嘴套的皮带。']],
      [
        ['sheep', '咩？'],
        ['', '它把头靠在守护者冰凉的手指上，打了个哈欠。'],
      ],
      [
        ['', '它的毛里夹着几片花瓣，不知道是从哪朵花上掉下来的。'],
        ['', '……但愿不是那一朵。'],
      ],
      [
        ['sheep', '咩——'],
        ['', '从箱子里跑出来以后，它好像胖了一点。'],
      ],
      [
        ['sheep', '咩……{name}……咩。'],
        ['', '它念你的名字，念得像在念一种很好吃的草。'],
      ],
    ],
  },
  box: {
    first: [
      ['', '一只小木箱，侧面钻着三个透气的小孔。'],
      ['', '箱子是空的，里面只铺着一点干草。'],
      ['', '看来，住在里面的那只羊，自己跑出来了。'],
    ],
    again: [
      [['', '你凑近小孔往里看，什么也看不见。可你总觉得，里面还睡着一只羊。']],
      [['', '有时候，一只箱子比一只羊更像一只羊。']],
    ],
  },
  tapir: {
    first: [
      ['tapir', '嘘——我在吃东西。'],
      ['you', '你在吃草吗？'],
      ['tapir', '不，我在吃梦。昨天夜里，这座山上飘满了梦。'],
      ['tapir', '有一个梦是从天上掉下来的，背面写着“{name}”。'],
      ['tapir', '里面有发动机的声音，还有一点点害怕。'],
      ['tapir', '我把害怕的那部分吃掉了。飞行的那部分，还给你。'],
      ['tapir', '不用谢。黑白两色的动物，本来就是用来把梦和醒分开的。'],
    ],
    again: [
      [
        ['tapir', '大人们的梦总是很硬，要嚼很久。'],
        ['tapir', '小孩子的梦是软的，像刚冒出来的草。'],
      ],
      [
        ['tapir', '你知道我为什么一半黑、一半白吗？'],
        ['you', '为什么？'],
        ['tapir', '这样，夜里的人只能看见我的一半。另一半留给白天。'],
      ],
      [
        ['tapir', '{name}，今晚要是做了噩梦，就到这片山坡上来找我。'],
        ['tapir', '我会轻轻地走过去，不会把你吵醒。'],
      ],
      [['', '马来貘用鼻子碰了碰一朵野花，闻了很久，然后决定不吃它。']],
    ],
  },
  shoebill: {
    first: [
      ['shoebill', '……'],
      ['you', '你好？'],
      ['shoebill', '……'],
      ['shoebill', '我在想事情。已经想了三天了。'],
      ['you', '想什么？'],
      ['shoebill', '想我要不要动一下。'],
      ['shoebill', '守护者在这里坐着，比我站得还久。我在跟它学。'],
      ['shoebill', '你是……{name}。'],
      ['you', '我还没告诉你呢。'],
      ['shoebill', '风说的。三天前就说了。'],
      ['', '它非常、非常慢地，向你鞠了一躬。'],
    ],
    again: [
      [
        ['shoebill', '……'],
        ['shoebill', '你刚才说话了吗？我还在回答上一句。'],
      ],
      [
        ['shoebill', '大人们看见我，总以为我在生气。'],
        ['shoebill', '就像他们看见那块石头，总以为那是一顶帽子。'],
      ],
      [
        ['shoebill', '一动不动站得够久，风就会以为你是一棵树。'],
        ['shoebill', '然后，它会把秘密讲给你听。'],
      ],
      [['', '鲸头鹳看着云，你也看着云。谁都没有说话，这样很好。']],
      [
        ['shoebill', '……{name}。'],
        ['shoebill', '没什么。我只是想确认一下，我还记得。'],
      ],
    ],
  },
  guardian: {
    first: [
      ['', '它不说话。'],
      ['', '你把手贴在它的手指上。石头被太阳晒得温热，缝隙里长着细细的草。'],
      ['', '它的眼睛暗着，像一口很深很深的井。'],
    ],
    again: [
      [['', '有鸟停在它的头顶上。它一动不动，好像怕把鸟吵醒。']],
      [['', '它面朝着云海。也许它在等一艘很久很久以前开走的船。']],
      [['', '它的一只手垂得很低——刚好替那朵玫瑰挡住了风。']],
      [['', '你在它脚边坐了一会儿。风穿过它空荡荡的关节，像一首很老的歌。']],
    ],
    awake: [
      ['', '你把手贴在它的手指上。'],
      ['', '很久很久，什么也没有发生。'],
      ['', '然后，它的眼睛很轻很轻地亮了一下。'],
      ['', '像一颗星星，在白天也笑了。'],
      ['', '风穿过它空荡荡的关节，发出很轻很轻的声音——听起来，像是在叫你的名字：{name}。'],
      ['', '也许它一直在等的，不是谁回来，而是有人陪它一起，看一会儿云。'],
      ['', '从今以后，每当你抬头看云，都会想起这座山上的它们。'],
    ],
    after: [
      [['', '它的眼睛里，有一点很小很小的光。']],
      [['', '风从云海深处吹来。它还是那样沉默地坐着，可是你知道，它在笑。']],
    ],
  },
}

const en: Book = {
  plane: {
    first: [
      ['', 'This is your aeroplane. It has buried its nose in the grass, as if smelling the earth.'],
      ['', 'One propeller blade is bent, and a small cloud is stuck in the engine.'],
      ['', 'There is water enough for a few days. Mending it will take a long time — but today you are in no hurry at all.'],
    ],
    again: [
      [['', 'You tighten a bolt. The aeroplane seems to give a small sigh.']],
      [['', 'You draw a sheep on the wing, study it for a long while, then rub it out. This one looks rather ill.']],
      [['', 'So you draw a box instead, with three little holes in its side. That is much better.']],
      [['', 'Far away, the clouds are slowly changing shape. You decide the engine can wait until tomorrow.']],
    ],
  },
  hat: {
    first: [
      ['', 'A strangely shaped stone: low at one end, high at the other, with a great bulge in the middle.'],
      ['', 'Grown-ups who pass by always say, “What a nice hat.”'],
      ['', 'But you can see at once that it is a boa constrictor that has swallowed an elephant, and is slowly digesting it.'],
      ['you', '…Better not to explain it to the grown-ups.'],
    ],
    again: [
      [['', 'The boa is still digesting. By the look of it, it will take several months.']],
      [['', 'You put your ear to the stone. Somewhere inside, an elephant is snoring very quietly.']],
    ],
  },
  sprout: {
    first: [
      ['', 'A little shoot has come up through the grass, holding up two round leaves.'],
      ['', 'It is a baobab sprout. While they are small, they look almost exactly like rose sprouts.'],
      ['', 'You pull it up by the root. Left to grow, its roots would split the whole hill apart.'],
    ],
    more: [['', 'Another one pulled. It is a dull job, but an important one.']],
    last: [
      ['', 'That is all the baobab sprouts for today.'],
      ['', 'Tomorrow morning they will come up again. You must remember, every day.'],
    ],
  },
  fox: {
    meet: [
      [
        ['fox', 'Stop there. One more step and I will run.'],
        ['you', 'I won’t hurt you. My name is {name}.'],
        ['fox', '{name}… I know you won’t. But knowing a name is not the same as knowing someone.'],
        ['fox', 'On this hill you are only someone passing by, and I am only a patch of orange in the grass.'],
        ['fox', 'If you came often, and sat a little closer each time…'],
        ['fox', 'then one day I might tell your footsteps apart from the sound of the wind.'],
        ['fox', 'That is enough for today. Next time, you may come a little nearer.'],
      ],
      [
        ['fox', 'You came back, {name}.'],
        ['fox', 'Do you know, I started being happy before the clouds had even drifted over?'],
        ['fox', 'The nearer it came to your coming, the more I fidgeted. My tail kept sweeping the grass.'],
        ['fox', 'That is why there should be a proper hour. Otherwise I never know when to start getting my heart ready.'],
        ['fox', 'Go on now. Next time, a little closer.'],
      ],
      [
        ['fox', 'I don’t eat bread, and I don’t watch clouds. Clouds never meant anything to me.'],
        ['fox', 'But that red ribbon… from now on, whenever I see it flying in the wind, I will think of you.'],
        ['fox', 'And I will come to love the sound of the wind in the grass.'],
        ['fox', 'There, {name}. You have tamed me.'],
        ['fox', 'From now on, wherever you go, I will follow.'],
      ],
    ],
    tamed: [
      [
        ['fox', 'Here is a secret: you have to close your eyes to see the things that matter most.'],
        ['fox', 'Like now. My eyes are shut, and still I know it’s you, {name}.'],
      ],
      [['fox', 'The time you spent on me is what makes me different from every other fox.']],
      [['fox', 'Don’t forget, {name}: you tamed me. That is something you are responsible for, always.']],
      [['fox', 'Are you watching the clouds, {name}? I am watching you watch the clouds.']],
      [['fox', 'The wind is gentlest by the rose. The guardian’s hand keeps it off her.']],
      [['fox', 'Today the wind smells a little sweet.']],
    ],
  },
  rose: {
    first: [
      ['', 'Beside the guardian’s big hand, resting in the grass, a red rose is growing under a glass dome.'],
      ['', 'You gently lift the glass.'],
      ['rose', 'Ah, there you are at last. I have only just woken up; my petals are not yet in order.'],
      ['you', 'Hello. My name is {name}.'],
      ['rose', '{name}. A fine name — though not, of course, as fine as “rose”.'],
      ['rose', 'Have you seen my thorns? One, two, three, four. I am not the least bit afraid.'],
      ['rose', '…Though the wind is a little cold. When you leave, remember to put my dome back.'],
    ],
    again: [
      [['rose', 'That big one keeps the wind off me every day. It never says a word, but I know it is listening.']],
      [['rose', 'You needn’t come to see me every day, {name}. …But if you do come, I shall be very glad.']],
      [['rose', 'I have no need of a screen, you understand. I am only… a tiny bit afraid of the cold.']],
      [['rose', 'You think there are many roses in the world? Perhaps. But I am the only one whose dome you have lifted.']],
    ],
    fox: [['rose', 'You smell of fox, {name}. So you have tamed something too.']],
  },
  sheep: {
    first: [
      ['sheep', 'Baa—'],
      ['', 'A little sheep, fluffy as a cloud, is very seriously chewing a blade of grass.'],
      ['', 'It looks at the rose, and then at you.'],
      ['you', '…You are not to eat her.'],
      ['sheep', 'Baa.'],
    ],
    again: [
      [['', 'You remember that you ought to draw it a muzzle. But you forgot to draw the strap.']],
      [
        ['sheep', 'Baa?'],
        ['', 'It rests its head against the guardian’s cold fingers and yawns.'],
      ],
      [
        ['', 'There are a few petals caught in its wool. Who knows which flower they fell from.'],
        ['', '…Let us hope not that one.'],
      ],
      [
        ['sheep', 'Baa—'],
        ['', 'It seems a little plumper since it came out of its box.'],
      ],
      [
        ['sheep', 'Baa… {name}… baa.'],
        ['', 'It says your name the way one might say the name of a particularly delicious grass.'],
      ],
    ],
  },
  box: {
    first: [
      ['', 'A small wooden box with three air holes in its side.'],
      ['', 'It is empty, except for a little dry grass.'],
      ['', 'The sheep that lived in it must have let itself out.'],
    ],
    again: [
      [['', 'You peer through a hole and cannot see a thing. Still, you feel sure there is a sheep asleep in there.']],
      [['', 'Sometimes a box is more of a sheep than a sheep is.']],
    ],
  },
  tapir: {
    first: [
      ['tapir', 'Shh — I’m eating.'],
      ['you', 'Eating grass?'],
      ['tapir', 'No. Dreams. Last night the whole hill was full of them.'],
      ['tapir', 'One of them fell out of the sky. On the back it said “{name}”.'],
      ['tapir', 'It had an engine in it, and a little bit of being afraid.'],
      ['tapir', 'I ate the afraid part. The flying part I’m giving back to you.'],
      ['tapir', 'Don’t thank me. Black-and-white animals are made for keeping dreams and waking apart.'],
    ],
    again: [
      [
        ['tapir', 'Grown-ups’ dreams are always tough. You have to chew them for a long time.'],
        ['tapir', 'Children’s dreams are soft, like grass that has only just come up.'],
      ],
      [
        ['tapir', 'Do you know why I’m half black and half white?'],
        ['you', 'Why?'],
        ['tapir', 'So that at night you can only see half of me. The other half I keep for the day.'],
      ],
      [
        ['tapir', 'If you have a bad dream tonight, {name}, come and find me on this slope.'],
        ['tapir', 'I’ll walk over very softly. I won’t wake you.'],
      ],
      [['', 'The tapir touches a wildflower with its trunk, smells it for a long time, and decides not to eat it.']],
    ],
  },
  shoebill: {
    first: [
      ['shoebill', '…'],
      ['you', 'Hello?'],
      ['shoebill', '…'],
      ['shoebill', 'I’m thinking. I’ve been thinking for three days.'],
      ['you', 'About what?'],
      ['shoebill', 'About whether I ought to move.'],
      ['shoebill', 'The guardian has sat here even longer than I have stood. I’m learning from it.'],
      ['shoebill', 'You are… {name}.'],
      ['you', 'I haven’t told you yet.'],
      ['shoebill', 'The wind did. Three days ago.'],
      ['', 'Very, very slowly, it bows to you.'],
    ],
    again: [
      [
        ['shoebill', '…'],
        ['shoebill', 'Did you say something just now? I’m still answering the last thing you said.'],
      ],
      [
        ['shoebill', 'Grown-ups look at me and think I’m cross.'],
        ['shoebill', 'The same way they look at that stone and think it’s a hat.'],
      ],
      [
        ['shoebill', 'Stand still long enough and the wind thinks you are a tree.'],
        ['shoebill', 'And then it tells you its secrets.'],
      ],
      [['', 'The shoebill watches the clouds, and so do you. Nobody says anything. It is nice like this.']],
      [
        ['shoebill', '…{name}.'],
        ['shoebill', 'Nothing. I only wanted to check that I still remember.'],
      ],
    ],
  },
  guardian: {
    first: [
      ['', 'It does not speak.'],
      ['', 'You lay your hand against its fingers. The stone is warm from the sun, and fine grass grows in the cracks.'],
      ['', 'Its eye is dark, like a very, very deep well.'],
    ],
    again: [
      [['', 'A bird is sitting on its head. It keeps perfectly still, as if afraid to wake it.']],
      [['', 'It faces the sea of clouds. Perhaps it is waiting for a ship that sailed a long, long time ago.']],
      [['', 'One of its hands hangs low — just where it keeps the wind off the rose.']],
      [['', 'You sit at its feet for a while. The wind passes through its hollow joints like a very old song.']],
    ],
    awake: [
      ['', 'You lay your hand against its fingers.'],
      ['', 'For a long, long time, nothing happens.'],
      ['', 'Then, very softly, its eye begins to glow.'],
      ['', 'Like a star that laughs, even in daylight.'],
      ['', 'The wind passes through its hollow joints with a very soft sound. It sounds as if it is calling your name: {name}.'],
      ['', 'Perhaps it was never waiting for someone to come back — only for someone to sit and watch the clouds with it for a while.'],
      ['', 'From now on, whenever you look up at the clouds, you will think of all of them on this hill.'],
    ],
    after: [
      [['', 'There is a very small light in its eye now.']],
      [['', 'The wind blows in from deep in the sea of clouds. It sits as silent as ever, but you know it is smiling.']],
    ],
  },
}

export const BOOKS: Record<Locale, Book> = { 'zh-CN': zh, en }

/** What the hill remembers (`stars`, `fox`, `awake` are saved; the rest lasts one visit). */
export type StoryState = {
  stars: StarId[]
  fox: number
  awake: boolean
  /** Conversations already had with each target during this visit. */
  visits: Partial<Record<Target, number>>
  /** Baobab sprouts still standing (including the one being pulled). */
  sproutsLeft: number
  roseSmeltFox: boolean
}

export type Effects = {
  star?: StarId
  /** New fox taming level. */
  fox?: number
  pullSprout?: boolean
  liftDome?: boolean
  awaken?: boolean
  roseSmeltFox?: boolean
}

const cycle = <T>(list: T[], n: number): T => list[((n % list.length) + list.length) % list.length]

export type Choice = { lines: Line[]; effects: Effects; /** A repeat line was used: advance `visits`. */ repeat?: boolean }

/** Pick what a target says now, and what talking to it changes. */
export function chooseScript(book: Book, target: Target, s: StoryState): Choice {
  const seen = s.stars.includes(target)
  const n = s.visits[target] ?? 0
  const first = (lines: Line[]): Choice => ({ lines, effects: { star: target } })
  const again = (list: Line[][], effects: Effects = {}): Choice => ({ lines: cycle(list, n), effects, repeat: true })
  switch (target) {
    case 'plane':
    case 'hat':
    case 'sheep':
    case 'box':
    case 'tapir':
    case 'shoebill': {
      const b = book[target]
      if (!seen) return first(b.first)
      return again(b.again)
    }
    case 'sprout': {
      const b = book.sprout
      if (!seen) return { lines: b.first, effects: { star: 'sprout', pullSprout: true } }
      return { lines: s.sproutsLeft <= 1 ? b.last : b.more, effects: { pullSprout: true } }
    }
    case 'fox': {
      const b = book.fox
      if (s.fox < FOX_TAMED) {
        const level = Math.max(0, s.fox)
        const effects: Effects = { fox: level + 1 }
        if (level + 1 >= FOX_TAMED) effects.star = 'fox'
        return { lines: b.meet[level], effects }
      }
      return again(b.tamed, seen ? {} : { star: 'fox' })
    }
    case 'rose': {
      const b = book.rose
      if (!seen) return { lines: b.first, effects: { star: 'rose', liftDome: true } }
      if (s.fox >= FOX_TAMED && !s.roseSmeltFox) return { lines: b.fox, effects: { liftDome: true, roseSmeltFox: true } }
      return again(b.again, { liftDome: true })
    }
    case 'guardian': {
      const b = book.guardian
      if (!seen) return first(b.first)
      if (s.awake) return again(b.after)
      if (STARS.every(id => s.stars.includes(id))) return { lines: b.awake, effects: { awaken: true } }
      return again(b.again)
    }
  }
}
